package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── WebSocket connection state ─────────────────────────────────────────────

var (
	wsConn     *websocket.Conn
	wsMu       sync.Mutex
	wsConnFlag bool
)

// wsMessage is the JSON envelope for all WS messages.
type wsMessage struct {
	Type string `json:"type"`
	// Additional fields depend on type — decoded dynamically
}

// ─── Probe WebSocket availability check ─────────────────────────────────────

// wsAvailable tests if the server supports the raw WebSocket endpoint /api/probe/ws.
func wsAvailable() bool {
	wsURL := buildWsURL()
	if wsURL == "" {
		return false
	}

	log.Printf("WS probe: testing connection to %s", wsURL)

	headers := buildWsHeaders()
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.Dial(wsURL, headers)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		log.Printf("WS probe: dial failed (HTTP %d): %v — using HTTP fallback", status, err)
		return false
	}
	conn.Close()
	log.Printf("WS probe: server supports raw WebSocket on /api/probe/ws")
	return true
}

// buildWsURL converts the server URL to the raw WS endpoint.
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
	return fmt.Sprintf("%s://%s/api/probe/ws", scheme, u.Host)
}

// buildWsHeaders returns HTTP headers for the WS upgrade handshake.
func buildWsHeaders() http.Header {
	h := http.Header{}
	h.Set("X-API-Key", cfg.APIKey)
	h.Set("X-Probe-UUID", cfg.DeviceUUID)
	if u, err := url.Parse(cfg.ServerURL); err == nil {
		h.Set("Host", u.Host)
	}
	return h
}

// ─── WebSocket main loop ────────────────────────────────────────────────────

func wsMainLoop() {
	backoff := time.Second
	maxBackoff := 60 * time.Second

	for {
		err := wsRun()
		if err != nil {
			log.Printf("WS connection lost: %v", err)
		}

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

// wsRun establishes a raw WebSocket connection and runs until disconnection.
func wsRun() error {
	wsURL := buildWsURL()
	if wsURL == "" {
		return fmt.Errorf("no server URL configured")
	}

	headers := buildWsHeaders()
	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}

	conn, resp, err := dialer.Dial(wsURL, headers)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		return fmt.Errorf("dial failed (HTTP %d): %w", status, err)
	}
	defer func() {
		wsMu.Lock()
		wsConn = nil
		wsConnFlag = false
		wsMu.Unlock()
		conn.Close()
	}()

	wsMu.Lock()
	wsConn = conn
	wsConnFlag = true
	wsMu.Unlock()

	log.Printf("WS connected to %s", cfg.ServerURL)

	// Channels for coordination
	done := make(chan error, 1)
	scanTrigger := make(chan struct{}, 1)

	// Scan ticker — triggers scans at the configured interval
	go func() {
		// Initial scan immediately
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
				default:
				}
			case <-done:
				return
			}
		}
	}()

	// Scan worker — performs scans and sends results
	go func() {
		for range scanTrigger {
			body := doScan()
			if err := wsSendJSON(conn, map[string]interface{}{
				"type":    "scan_result",
				"payload": body,
			}); err != nil {
				log.Printf("WS send scan_result failed: %v", err)
				done <- err
				return
			}
		}
	}()

	// Heartbeat — every 25s (matches server's 15s ping interval window)
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := wsSendJSON(conn, map[string]string{"type": "heartbeat"}); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Respond to server pings (RFC 6455 ping/pong is handled by gorilla/websocket
	// automatically via SetPongHandler — but we also set a read deadline)
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		return nil
	})
	conn.SetReadDeadline(time.Now().Add(45 * time.Second))

	// Main read loop
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			done <- err
			return err
		}
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))

		var msg map[string]json.RawMessage
		if json.Unmarshal(rawMsg, &msg) != nil {
			continue
		}

		var msgType string
		if json.Unmarshal(msg["type"], &msgType) != nil {
			continue
		}

		handleWsMsg(msgType, rawMsg, scanTrigger)
	}
}

// ─── Message helpers ────────────────────────────────────────────────────────

func wsSendJSON(conn *websocket.Conn, v interface{}) error {
	wsMu.Lock()
	defer wsMu.Unlock()
	return conn.WriteJSON(v)
}

func handleWsMsg(msgType string, raw []byte, scanTrigger chan<- struct{}) {
	switch msgType {
	case "command":
		var msg struct {
			Command string `json:"command"`
		}
		if json.Unmarshal(raw, &msg) == nil && msg.Command != "" {
			log.Printf("WS received command: %s", msg.Command)
			if msg.Command == "rescan" {
				select {
				case scanTrigger <- struct{}{}:
				default:
				}
			} else {
				handleCommand(msg.Command, cfg.ScanIntervalSeconds)
			}
		}

	case "config_update":
		var msg struct {
			Config        ProbeResponseConfig `json:"config"`
			LatestVersion string              `json:"latestVersion"`
		}
		if json.Unmarshal(raw, &msg) == nil {
			applyPushResponse(PushResponse{Config: msg.Config, LatestVersion: msg.LatestVersion})
			log.Printf("WS config updated (interval=%ds, flow=%v)",
				cfg.ScanIntervalSeconds, cachedFlowAnalysisEnabled)
			if msg.LatestVersion != "" && isStrictlyNewer(msg.LatestVersion, ProbeVersion) {
				log.Printf("Update available: %s → %s", ProbeVersion, msg.LatestVersion)
				go applyUpdate(msg.LatestVersion)
			}
		}

	case "tunnel_open":
		var msg struct {
			TunnelID   string `json:"tunnelId"`
			TargetIP   string `json:"targetIp"`
			TargetPort int    `json:"targetPort"`
		}
		if json.Unmarshal(raw, &msg) == nil && msg.TunnelID != "" {
			go handleTunnelOpen(msg.TunnelID, msg.TargetIP, msg.TargetPort)
		}

	case "tunnel_close":
		var msg struct {
			TunnelID string `json:"tunnelId"`
		}
		if json.Unmarshal(raw, &msg) == nil && msg.TunnelID != "" {
			handleTunnelClose(msg.TunnelID)
		}

	case "heartbeat_ack":
		// no-op

	default:
		log.Printf("WS unknown message type: %s", msgType)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// Keep strings import used
var _ = strings.HasPrefix
