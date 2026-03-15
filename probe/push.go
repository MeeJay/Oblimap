package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"time"
)

// ─── Push payload types ───────────────────────────────────────────────────────

type OSInfo struct {
	Platform string `json:"platform"`
	Release  string `json:"release,omitempty"`
	Arch     string `json:"arch"`
}

type DiscoveredDevice struct {
	IP             string  `json:"ip"`
	MAC            string  `json:"mac,omitempty"`
	Hostname       string  `json:"hostname,omitempty"`
	ResponseTimeMs *int64  `json:"responseTimeMs,omitempty"`
	IsOnline       bool    `json:"isOnline"`
	OpenPorts      []int   `json:"openPorts,omitempty"`
}

type PushBody struct {
	Hostname          string             `json:"hostname"`
	ProbeVersion      string             `json:"probeVersion"`
	OSInfo            OSInfo             `json:"osInfo"`
	ProbeMac          string             `json:"probeMac,omitempty"`
	DiscoveredDevices []DiscoveredDevice `json:"discoveredDevices"`
	ScannedSubnets    []string           `json:"scannedSubnets"`
	ScanDurationMs    int64              `json:"scanDurationMs"`
}

type ProbeResponseConfig struct {
	ScanIntervalSeconds int      `json:"scanIntervalSeconds"`
	ExcludedSubnets     []string `json:"excludedSubnets"`
	ExtraSubnets        []string `json:"extraSubnets"`
	PortScanEnabled     bool     `json:"portScanEnabled"`
	PortScanPorts       []int    `json:"portScanPorts"`
}

type PushResponse struct {
	Status        string              `json:"status"`
	Config        ProbeResponseConfig `json:"config"`
	LatestVersion string              `json:"latestVersion,omitempty"`
	Command       string              `json:"command,omitempty"`
}

// backoff levels in minutes
var backoffLevels = []time.Duration{5 * time.Minute, 10 * time.Minute, 30 * time.Minute, 60 * time.Minute}
var backoffIdx = 0

func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		h = "unknown"
	}
	return h
}

func osInfo() OSInfo {
	return OSInfo{
		Platform: runtime.GOOS,
		Arch:     runtime.GOARCH,
	}
}

// probeMac returns the MAC address of the network interface used to reach the
// configured server. It dials a UDP "connection" (no packets sent) to the
// server host to let the OS pick the outbound interface, then finds the
// interface whose IPv4 address matches the chosen local address.
func probeMac() string {
	// Extract host from ServerURL (e.g. "https://example.com:3002" → "example.com:80")
	dialHost := "8.8.8.8:80"
	if cfg.ServerURL != "" {
		if u, err := url.Parse(cfg.ServerURL); err == nil && u.Hostname() != "" {
			port := u.Port()
			if port == "" {
				if u.Scheme == "https" {
					port = "443"
				} else {
					port = "80"
				}
			}
			dialHost = u.Hostname() + ":" + port
		}
	}

	conn, err := net.Dial("udp", dialHost)
	if err != nil {
		return ""
	}
	localAddr := conn.LocalAddr().(*net.UDPAddr).IP
	conn.Close()

	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil && ip.Equal(localAddr) {
				if len(iface.HardwareAddr) > 0 {
					return normalizeMacGo(iface.HardwareAddr.String())
				}
			}
		}
	}
	return ""
}

// normalizeMacGo converts a MAC from Go's default "aa:bb:cc:dd:ee:ff" to
// uppercase "AA:BB:CC:DD:EE:FF" to match the server's normalization.
func normalizeMacGo(mac string) string {
	result := make([]byte, len(mac))
	for i, b := range []byte(mac) {
		if b >= 'a' && b <= 'f' {
			result[i] = b - 32
		} else {
			result[i] = b
		}
	}
	return string(result)
}

// doPush performs one full scan+push cycle. Returns the next interval in seconds.
func doPush() int {
	scanStart := time.Now()

	// Discover subnets
	subnets := discoverSubnets(cfg.ScanIntervalSeconds)

	// Apply extra/excluded from config (we'll get these from server response later,
	// but use whatever we cached in cfg last time)
	var scannedSubnets []string
	var devices []DiscoveredDevice

	for _, sn := range subnets {
		if isExcluded(sn.String()) {
			continue
		}
		scannedSubnets = append(scannedSubnets, sn.String())
		found := scanSubnet(sn)
		devices = append(devices, found...)
	}

	scanDurationMs := time.Since(scanStart).Milliseconds()
	log.Printf("Scan complete: %d devices in %d subnets (%dms)",
		len(devices), len(scannedSubnets), scanDurationMs)

	body := PushBody{
		Hostname:          hostname(),
		ProbeVersion:      ProbeVersion,
		OSInfo:            osInfo(),
		ProbeMac:          probeMac(),
		DiscoveredDevices: devices,
		ScannedSubnets:    scannedSubnets,
		ScanDurationMs:    scanDurationMs,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		log.Printf("ERROR: marshal push body: %v", err)
		return cfg.ScanIntervalSeconds
	}

	url := fmt.Sprintf("%s/api/probe/push", cfg.ServerURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		log.Printf("ERROR: create push request: %v", err)
		return cfg.ScanIntervalSeconds
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", cfg.APIKey)
	req.Header.Set("X-Probe-UUID", cfg.DeviceUUID)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("WARN: push failed: %v", err)
		return cfg.ScanIntervalSeconds
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("WARN: 401 unauthorized — check API key. Backing off.")
		backoff := backoffLevels[min(backoffIdx, len(backoffLevels)-1)]
		backoffIdx++
		cfg.BackoffUntil = time.Now().Add(backoff).UnixMilli()
		saveConfig()
		return int(backoff.Seconds())
	}
	backoffIdx = 0
	cfg.BackoffUntil = 0

	var pushResp PushResponse
	if err := json.NewDecoder(resp.Body).Decode(&pushResp); err != nil {
		log.Printf("WARN: decode push response: %v", err)
		return cfg.ScanIntervalSeconds
	}

	// Process command (one-shot, delivered before version check)
	if pushResp.Command != "" {
		log.Printf("Received command: %s", pushResp.Command)
		handleCommand(pushResp.Command, pushResp.Config.ScanIntervalSeconds)
		return cfg.ScanIntervalSeconds
	}

	// Apply config from server
	if pushResp.Config.ScanIntervalSeconds > 0 {
		cfg.ScanIntervalSeconds = pushResp.Config.ScanIntervalSeconds
	}
	// Store excluded/extra subnets and port scan config for next scan
	cachedExcluded = pushResp.Config.ExcludedSubnets
	cachedExtra = pushResp.Config.ExtraSubnets
	cachedPortScanEnabled = pushResp.Config.PortScanEnabled
	if pushResp.Config.PortScanPorts != nil {
		cachedPortScanPorts = pushResp.Config.PortScanPorts
	}
	saveConfig()

	// Check for update
	if pushResp.LatestVersion != "" && isStrictlyNewer(pushResp.LatestVersion, ProbeVersion) {
		log.Printf("Update available: %s → %s", ProbeVersion, pushResp.LatestVersion)
		go applyUpdate(pushResp.LatestVersion)
	}

	if resp.StatusCode == http.StatusAccepted {
		log.Printf("Status: pending approval (202)")
	}

	return cfg.ScanIntervalSeconds
}

// Cached subnet config from last server response
var cachedExcluded []string
var cachedExtra []string

// Cached port scan config from last server response
var cachedPortScanEnabled bool
var cachedPortScanPorts []int

func isExcluded(subnet string) bool {
	for _, ex := range cachedExcluded {
		if ex == subnet {
			return true
		}
	}
	return false
}

func handleCommand(command string, scanInterval int) {
	switch command {
	case "uninstall":
		log.Println("Executing uninstall command...")
		performUninstall(cfg.ServerURL)
		os.Exit(0)
	case "update":
		log.Println("Executing update command...")
		applyUpdate("")
	case "rescan":
		log.Println("Rescan command received — will scan immediately on next loop")
		// No special action needed; the loop continues immediately after this returns
	default:
		log.Printf("Unknown command: %s", command)
	}
}

// ─── Version helpers ──────────────────────────────────────────────────────────

func isStrictlyNewer(remote, current string) bool {
	var rMaj, rMin, rPatch int
	var cMaj, cMin, cPatch int
	fmt.Sscanf(remote, "%d.%d.%d", &rMaj, &rMin, &rPatch)
	fmt.Sscanf(current, "%d.%d.%d", &cMaj, &cMin, &cPatch)
	if rMaj != cMaj {
		return rMaj > cMaj
	}
	if rMin != cMin {
		return rMin > cMin
	}
	return rPatch > cPatch
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
