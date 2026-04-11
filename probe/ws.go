package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── Socket.io Engine.IO v4 protocol constants ──────────────────────────────

const (
	eioOpen    = '0' // Server → Client: open (session info)
	eioClose   = '1' // Bidirectional: close
	eioPing    = '2' // Server → Client: ping
	eioPong    = '3' // Client → Server: pong
	eioMessage = '4' // Bidirectional: message (wraps Socket.io packet)
)

// Socket.io packet types (prefixed inside EIO message)
const (
	sioConnect    = '0' // Connect to namespace
	sioDisconnect = '1' // Disconnect from namespace
	sioEvent      = '2' // Event (JSON array: ["event", payload])
	sioAck        = '3' // Ack
)

const wsNamespace = "/probe"

// ─── WebSocket connection state ─────────────────────────────────────────��───

var (
	wsConn     *websocket.Conn
	wsMu       sync.Mutex
	wsConnFlag bool // true while connected
)

// wsAvailable attempts a quick WebSocket probe to see if the server supports
// the /probe namespace. Returns true if the server accepted the connection.
func wsAvailable() bool {
	wsURL := buildWsURL()
	if wsURL == "" {
		return false
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		log.Printf("WS probe: server does not support WebSocket (%v), using HTTP fallback", err)
		return false
	}

	// Read the EIO open packet
	_, msg, err := conn.ReadMessage()
	if err != nil || len(msg) == 0 || msg[0] != eioOpen {
		conn.Close()
		return false
	}

	// Try to connect to /probe namespace
	authJSON, _ := json.Marshal(map[string]string{
		"apiKey":    cfg.APIKey,
		"probeUuid": cfg.DeviceUUID,
	})
	connectMsg := fmt.Sprintf("%c%c%s,%s", eioMessage, sioConnect, wsNamespace, string(authJSON))
	if err := conn.WriteMessage(websocket.TextMessage, []byte(connectMsg)); err != nil {
		conn.Close()
		return false
	}

	// Wait for connect ack (with timeout)
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, msg, err = conn.ReadMessage()
	conn.Close()
	if err != nil {
		return false
	}

	// Expect: 40/probe,{...} (connect ack)
	msgStr := string(msg)
	if len(msgStr) >= 2 && msgStr[0] == eioMessage && msgStr[1] == sioConnect {
		log.Printf("WS probe: server supports WebSocket /probe namespace")
		return true
	}

	return false
}

// buildWsURL converts the server URL to a Socket.io WebSocket URL.
func buildWsURL() string {
	if cfg.ServerURL == "" {
		return ""
	}
	u, err := url.Parse(cfg.ServerURL)
	if err != nil {
		return ""
	}

	scheme := "ws"
	if u.Scheme == "https" {
		scheme = "wss"
	}

	return fmt.Sprintf("%s://%s/socket.io/?EIO=4&transport=websocket", scheme, u.Host)
}

// ─── WebSocket main loop ────────────────────────────────────────────────────

// wsMainLoop is the main loop for WebSocket-connected probes.
// It maintains a persistent connection, sends scan results, and receives commands.
// Returns only on unrecoverable error (falls through to HTTP fallback).
func wsMainLoop() {
	backoff := time.Second
	maxBackoff := 60 * time.Second

	for {
		err := wsRun()
		if err != nil {
			log.Printf("WS connection lost: %v", err)
		}

		// Exponential backoff with jitter
		jitter := time.Duration(rand.Int63n(int64(backoff / 4)))
		sleepTime := backoff + jitter
		log.Printf("WS reconnecting in %v...", sleepTime.Round(time.Second))
		time.Sleep(sleepTime)

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// wsRun establishes a WebSocket connection and runs until disconnection.
func wsRun() error {
	wsURL := buildWsURL()
	if wsURL == "" {
		return fmt.Errorf("no server URL configured")
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}

	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial failed: %w", err)
	}
	defer func() {
		wsMu.Lock()
		wsConn = nil
		wsConnFlag = false
		wsMu.Unlock()
		conn.Close()
	}()

	// 1. Read EIO open packet
	_, msg, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read EIO open: %w", err)
	}
	if len(msg) == 0 || msg[0] != eioOpen {
		return fmt.Errorf("unexpected EIO packet: %s", string(msg))
	}

	// Parse ping interval from open packet
	var openData struct {
		PingInterval int `json:"pingInterval"`
		PingTimeout  int `json:"pingTimeout"`
	}
	if json.Unmarshal(msg[1:], &openData) == nil && openData.PingInterval > 0 {
		// We'll use the server's ping interval for our pong responder
	}

	// 2. Connect to /probe namespace with auth
	authJSON, _ := json.Marshal(map[string]string{
		"apiKey":    cfg.APIKey,
		"probeUuid": cfg.DeviceUUID,
	})
	connectMsg := fmt.Sprintf("%c%c%s,%s", eioMessage, sioConnect, wsNamespace, string(authJSON))
	if err := conn.WriteMessage(websocket.TextMessage, []byte(connectMsg)); err != nil {
		return fmt.Errorf("send connect: %w", err)
	}

	// 3. Wait for connect ack
	conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	_, msg, err = conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read connect ack: %w", err)
	}
	msgStr := string(msg)
	if len(msgStr) < 2 || msgStr[0] != eioMessage || msgStr[1] != sioConnect {
		// Check for connect error (44/probe,{...})
		if len(msgStr) >= 2 && msgStr[0] == eioMessage && msgStr[1] == '4' {
			return fmt.Errorf("server rejected connection: %s", msgStr)
		}
		return fmt.Errorf("unexpected connect response: %s", msgStr)
	}

	conn.SetReadDeadline(time.Time{}) // Clear deadline

	// Connection established
	wsMu.Lock()
	wsConn = conn
	wsConnFlag = true
	wsMu.Unlock()

	log.Printf("WS connected to %s", cfg.ServerURL)

	// Reset backoff on successful connection (the caller's loop will reset too
	// since we only return on error, but we signal via a channel pattern)

	// Start goroutines
	done := make(chan error, 1)
	scanTrigger := make(chan struct{}, 1)

	// Scan ticker goroutine
	go func() {
		// Do an initial scan immediately
		scanTrigger <- struct{}{}

		interval := time.Duration(cfg.ScanIntervalSeconds) * time.Second
		if interval < 30*time.Second {
			interval = 30 * time.Second
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				select {
				case scanTrigger <- struct{}{}:
				default: // scan already pending
				}
			case <-done:
				return
			}
		}
	}()

	// Scan worker goroutine
	go func() {
		for range scanTrigger {
			body := doScan()
			if err := wsSendEvent(conn, "probe:scan_result", body); err != nil {
				log.Printf("WS send scan_result failed: %v", err)
				done <- err
				return
			}
		}
	}()

	// Heartbeat goroutine (every 25s)
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := wsSendEvent(conn, "probe:heartbeat", nil); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Main read loop — handle incoming messages from server
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			done <- err
			return err
		}

		s := string(rawMsg)

		// EIO-level ping → respond with pong
		if len(s) > 0 && s[0] == eioPing {
			conn.WriteMessage(websocket.TextMessage, []byte{eioPong})
			continue
		}

		// Socket.io event message: 42/probe,["event",{payload}]
		if len(s) >= 2 && s[0] == eioMessage && s[1] == sioEvent {
			event, payload := parseSocketIOEvent(s)
			if event != "" {
				handleWsMessage(event, payload, scanTrigger)
			}
			continue
		}

		// EIO close
		if len(s) > 0 && s[0] == eioClose {
			done <- fmt.Errorf("server closed connection")
			return fmt.Errorf("server closed connection")
		}
	}
}

// ─── Socket.io message helpers ──────────────────────────────────────────────

// wsSendEvent sends a Socket.io event on the /probe namespace.
// Format: 42/probe,["eventName",payload]
func wsSendEvent(conn *websocket.Conn, event string, payload interface{}) error {
	var payloadJSON json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		payloadJSON = b
	}

	var msg string
	if payloadJSON != nil {
		msg = fmt.Sprintf("%c%c%s,[\"%s\",%s]", eioMessage, sioEvent, wsNamespace, event, string(payloadJSON))
	} else {
		msg = fmt.Sprintf("%c%c%s,[\"%s\"]", eioMessage, sioEvent, wsNamespace, event)
	}

	wsMu.Lock()
	defer wsMu.Unlock()
	return conn.WriteMessage(websocket.TextMessage, []byte(msg))
}

// parseSocketIOEvent parses a Socket.io event message.
// Input format: 42/probe,["eventName",{payload}]  or  42/probe,["eventName"]
// Returns the event name and raw JSON payload.
func parseSocketIOEvent(msg string) (string, json.RawMessage) {
	// Skip "42/probe," prefix
	prefix := fmt.Sprintf("%c%c%s,", eioMessage, sioEvent, wsNamespace)
	if !strings.HasPrefix(msg, prefix) {
		return "", nil
	}
	arrayJSON := msg[len(prefix):]

	var arr []json.RawMessage
	if err := json.Unmarshal([]byte(arrayJSON), &arr); err != nil || len(arr) == 0 {
		return "", nil
	}

	var eventName string
	if err := json.Unmarshal(arr[0], &eventName); err != nil {
		return "", nil
	}

	var payload json.RawMessage
	if len(arr) > 1 {
		payload = arr[1]
	}

	return eventName, payload
}

// ─── WS message handler ────────────────────────────────────────────────────

func handleWsMessage(event string, payload json.RawMessage, scanTrigger chan<- struct{}) {
	switch event {
	case "server:command":
		var cmd struct {
			Command string `json:"command"`
		}
		if json.Unmarshal(payload, &cmd) == nil && cmd.Command != "" {
			log.Printf("WS received command: %s", cmd.Command)
			if cmd.Command == "rescan" {
				// Trigger immediate scan
				select {
				case scanTrigger <- struct{}{}:
				default:
				}
			} else {
				handleCommand(cmd.Command, cfg.ScanIntervalSeconds)
			}
		}

	case "server:config_update":
		var resp PushResponse
		if json.Unmarshal(payload, &resp) == nil {
			applyPushResponse(resp)
			log.Printf("WS config updated (interval=%ds, flow=%v)",
				cfg.ScanIntervalSeconds, cachedFlowAnalysisEnabled)

			// Check for update
			if resp.LatestVersion != "" && isStrictlyNewer(resp.LatestVersion, ProbeVersion) {
				log.Printf("Update available: %s → %s", ProbeVersion, resp.LatestVersion)
				go applyUpdate(resp.LatestVersion)
			}
		}

	case "server:tunnel_open":
		var req struct {
			TunnelID   string `json:"tunnelId"`
			TargetIP   string `json:"targetIp"`
			TargetPort int    `json:"targetPort"`
		}
		if json.Unmarshal(payload, &req) == nil && req.TunnelID != "" {
			go handleTunnelOpen(req.TunnelID, req.TargetIP, req.TargetPort)
		}

	case "server:tunnel_close":
		var req struct {
			TunnelID string `json:"tunnelId"`
		}
		if json.Unmarshal(payload, &req) == nil && req.TunnelID != "" {
			handleTunnelClose(req.TunnelID)
		}

	case "probe:heartbeat_ack":
		// No action needed

	default:
		log.Printf("WS unknown event: %s", event)
	}
}
