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
	ProbeIPs          []string           `json:"probeIPs,omitempty"`
	DiscoveredDevices []DiscoveredDevice `json:"discoveredDevices"`
	DiscoveredFlows   []FlowEntry        `json:"discoveredFlows,omitempty"`
	ScannedSubnets    []string           `json:"scannedSubnets"`
	ScanDurationMs    int64              `json:"scanDurationMs"`
}

type ProbeResponseConfig struct {
	ScanIntervalSeconds int      `json:"scanIntervalSeconds"`
	ExcludedSubnets     []string `json:"excludedSubnets"`
	ExtraSubnets        []string `json:"extraSubnets"`
	PortScanEnabled     bool     `json:"portScanEnabled"`
	PortScanPorts       []int    `json:"portScanPorts"`
	FlowAnalysisEnabled bool     `json:"flowAnalysisEnabled"`
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

// probeLocalIP returns the local IPv4 address of the outbound interface
// (same interface that probeMac identifies).
func probeLocalIP() string {
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
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

// probeLocalIPs returns ALL private IPv4 addresses on the machine, across all
// non-loopback, non-virtual, up interfaces. This allows the server to track
// multi-homed probes and match them to devices on multiple subnets.
func probeLocalIPs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}

	var ips []string
	seen := make(map[string]bool)

	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		if isVirtualInterface(iface.Name) {
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
			if ip == nil {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil {
				continue // skip IPv6
			}
			ipStr := ip4.String()
			if seen[ipStr] {
				continue
			}
			if !isPrivateIPv4(ipStr) {
				continue
			}
			seen[ipStr] = true
			ips = append(ips, ipStr)
		}
	}

	return ips
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

// doScan performs a full network scan and returns the PushBody payload.
// This is shared between doPush() (HTTP) and wsMainLoop() (WebSocket).
func doScan() PushBody {
	scanStart := time.Now()

	subnets := discoverSubnets(cfg.ScanIntervalSeconds)

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

	// Inject the probe itself into the discovered devices list.
	myMac := probeMac()
	if myMac != "" {
		myIP := probeLocalIP()
		if myIP != "" {
			found := false
			for i, d := range devices {
				if d.IP == myIP {
					devices[i].MAC = myMac
					devices[i].IsOnline = true
					found = true
					break
				}
			}
			if !found {
				devices = append(devices, DiscoveredDevice{
					IP:       myIP,
					MAC:      myMac,
					Hostname: hostname(),
					IsOnline: true,
				})
			}
		}
	}

	log.Printf("Scan complete: %d devices in %d subnets (%dms)",
		len(devices), len(scannedSubnets), scanDurationMs)

	var discoveredFlows []FlowEntry
	if cachedFlowAnalysisEnabled {
		discoveredFlows = collectFlows()
	}

	allIPs := probeLocalIPs()

	return PushBody{
		Hostname:          hostname(),
		ProbeVersion:      ProbeVersion,
		OSInfo:            osInfo(),
		ProbeMac:          myMac,
		ProbeIPs:          allIPs,
		DiscoveredDevices: devices,
		DiscoveredFlows:   discoveredFlows,
		ScannedSubnets:    scannedSubnets,
		ScanDurationMs:    scanDurationMs,
	}
}

// applyPushResponse updates local config from the server's push/config response.
func applyPushResponse(pushResp PushResponse) {
	if pushResp.Config.ScanIntervalSeconds > 0 {
		cfg.ScanIntervalSeconds = pushResp.Config.ScanIntervalSeconds
	}
	cachedExcluded = pushResp.Config.ExcludedSubnets
	cachedExtra = pushResp.Config.ExtraSubnets
	cachedPortScanEnabled = pushResp.Config.PortScanEnabled
	if pushResp.Config.PortScanPorts != nil {
		cachedPortScanPorts = pushResp.Config.PortScanPorts
	}
	cachedFlowAnalysisEnabled = pushResp.Config.FlowAnalysisEnabled
	saveConfig()
}

// doPush performs one full scan+push cycle via HTTP. Returns the next interval in seconds.
func doPush() int {
	body := doScan()

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

	// Process command (one-shot)
	if pushResp.Command != "" {
		log.Printf("Received command: %s", pushResp.Command)
		handleCommand(pushResp.Command, pushResp.Config.ScanIntervalSeconds)
		return cfg.ScanIntervalSeconds
	}

	applyPushResponse(pushResp)

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

// Cached flow analysis config from last server response
var cachedFlowAnalysisEnabled bool

func isExcluded(subnet string) bool {
	_, snNet, err := net.ParseCIDR(subnet)
	if err != nil {
		// Fallback: exact string match
		for _, ex := range cachedExcluded {
			if ex == subnet {
				return true
			}
		}
		return false
	}
	snKey := snNet.String() // canonical form e.g. "192.168.1.0/24"

	for _, ex := range cachedExcluded {
		// Try parsing the exclusion as CIDR
		_, exNet, err2 := net.ParseCIDR(ex)
		if err2 != nil {
			// Maybe bare network like "192.168.1.0" — try with /24
			_, exNet, err2 = net.ParseCIDR(ex + "/24")
			if err2 != nil {
				if ex == subnet {
					return true
				}
				continue
			}
		}
		if exNet.String() == snKey {
			return true
		}
		// Also check if the scanned subnet is contained within the exclusion
		if exNet.Contains(snNet.IP) {
			ones1, _ := exNet.Mask.Size()
			ones2, _ := snNet.Mask.Size()
			if ones1 <= ones2 {
				return true
			}
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
