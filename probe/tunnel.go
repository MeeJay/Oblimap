package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── Active tunnel tracking ─────────────────────────────────────────────────

type activeTunnel struct {
	tunnelID string
	tcpConn  net.Conn
	wsConn   *websocket.Conn
	done     chan struct{}
}

var (
	tunnels   = make(map[string]*activeTunnel)
	tunnelsMu sync.Mutex
)

// handleTunnelOpen is called when the server requests a new tunnel.
// It dials the target TCP endpoint, opens a dedicated WebSocket back to the
// server for binary relay, and starts bidirectional forwarding.
func handleTunnelOpen(tunnelID, targetIP string, targetPort int) {
	addr := fmt.Sprintf("%s:%d", targetIP, targetPort)
	log.Printf("Tunnel %s: opening TCP to %s", tunnelID, addr)

	// 1. Dial TCP to target
	tcpConn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		log.Printf("Tunnel %s: TCP dial failed: %v", tunnelID, err)
		wsSendTunnelError(tunnelID, err.Error())
		return
	}

	// 2. Notify server that the tunnel is ready
	wsSendTunnelReady(tunnelID)

	// 3. Open dedicated WebSocket to server for binary relay
	tunnelWS, err := dialTunnelWS(tunnelID)
	if err != nil {
		log.Printf("Tunnel %s: WS dial failed: %v", tunnelID, err)
		tcpConn.Close()
		wsSendTunnelError(tunnelID, err.Error())
		return
	}

	tunnel := &activeTunnel{
		tunnelID: tunnelID,
		tcpConn:  tcpConn,
		wsConn:   tunnelWS,
		done:     make(chan struct{}),
	}

	tunnelsMu.Lock()
	tunnels[tunnelID] = tunnel
	tunnelsMu.Unlock()

	log.Printf("Tunnel %s: active (TCP %s ↔ WS)", tunnelID, addr)

	// 4. Start bidirectional relay
	go tunnelRelay(tunnel)
}

// handleTunnelClose closes an active tunnel.
func handleTunnelClose(tunnelID string) {
	tunnelsMu.Lock()
	tunnel, ok := tunnels[tunnelID]
	if ok {
		delete(tunnels, tunnelID)
	}
	tunnelsMu.Unlock()

	if !ok {
		return
	}

	log.Printf("Tunnel %s: closing", tunnelID)
	close(tunnel.done)
	tunnel.tcpConn.Close()
	tunnel.wsConn.Close()
}

// tunnelRelay forwards data between TCP and WebSocket connections.
func tunnelRelay(t *activeTunnel) {
	defer func() {
		tunnelsMu.Lock()
		delete(tunnels, t.tunnelID)
		tunnelsMu.Unlock()
		t.tcpConn.Close()
		t.wsConn.Close()
		log.Printf("Tunnel %s: closed", t.tunnelID)
	}()

	errCh := make(chan error, 2)

	// TCP → WS
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := t.tcpConn.Read(buf)
			if n > 0 {
				if wErr := t.wsConn.WriteMessage(websocket.BinaryMessage, buf[:n]); wErr != nil {
					errCh <- wErr
					return
				}
			}
			if err != nil {
				errCh <- err
				return
			}
		}
	}()

	// WS → TCP
	go func() {
		for {
			_, data, err := t.wsConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if _, err := t.tcpConn.Write(data); err != nil {
				errCh <- err
				return
			}
		}
	}()

	// Wait for either side to close or an explicit close command
	select {
	case err := <-errCh:
		if err != nil && err != io.EOF {
			log.Printf("Tunnel %s: relay error: %v", t.tunnelID, err)
		}
	case <-t.done:
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// dialTunnelWS opens a dedicated WebSocket to the server's /tunnel namespace.
func dialTunnelWS(tunnelID string) (*websocket.Conn, error) {
	u, err := url.Parse(cfg.ServerURL)
	if err != nil {
		return nil, err
	}

	scheme := "ws"
	if u.Scheme == "https" {
		scheme = "wss"
	}

	// Connect to Socket.io /tunnel namespace with tunnel ID + API key auth
	wsURL := fmt.Sprintf("%s://%s/socket.io/?EIO=4&transport=websocket", scheme, u.Host)

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("tunnel WS dial: %w", err)
	}

	// Read EIO open
	_, msg, err := conn.ReadMessage()
	if err != nil || len(msg) == 0 || msg[0] != eioOpen {
		conn.Close()
		return nil, fmt.Errorf("tunnel WS: bad EIO open")
	}

	// Connect to /tunnel namespace with auth
	authJSON, _ := json.Marshal(map[string]string{
		"apiKey":    cfg.APIKey,
		"probeUuid": cfg.DeviceUUID,
		"tunnelId":  tunnelID,
		"role":      "probe",
	})
	connectMsg := fmt.Sprintf("%c%c/tunnel,%s", eioMessage, sioConnect, string(authJSON))
	if err := conn.WriteMessage(websocket.TextMessage, []byte(connectMsg)); err != nil {
		conn.Close()
		return nil, err
	}

	// Wait for connect ack
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, msg, err = conn.ReadMessage()
	if err != nil {
		conn.Close()
		return nil, err
	}
	conn.SetReadDeadline(time.Time{})

	return conn, nil
}

// wsSendTunnelReady notifies the server via the control channel.
func wsSendTunnelReady(tunnelID string) {
	wsMu.Lock()
	c := wsConn
	wsMu.Unlock()
	if c == nil {
		return
	}
	wsSendEvent(c, "probe:tunnel_ready", map[string]string{"tunnelId": tunnelID})
}

// wsSendTunnelError notifies the server of a tunnel failure via the control channel.
func wsSendTunnelError(tunnelID, errMsg string) {
	wsMu.Lock()
	c := wsConn
	wsMu.Unlock()
	if c == nil {
		return
	}
	wsSendEvent(c, "probe:tunnel_error", map[string]string{"tunnelId": tunnelID, "error": errMsg})
}
