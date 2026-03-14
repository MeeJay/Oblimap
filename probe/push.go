package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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
}

type PushBody struct {
	Hostname          string             `json:"hostname"`
	ProbeVersion      string             `json:"probeVersion"`
	OSInfo            OSInfo             `json:"osInfo"`
	DiscoveredDevices []DiscoveredDevice `json:"discoveredDevices"`
	ScannedSubnets    []string           `json:"scannedSubnets"`
	ScanDurationMs    int64              `json:"scanDurationMs"`
}

type ProbeResponseConfig struct {
	ScanIntervalSeconds int      `json:"scanIntervalSeconds"`
	ExcludedSubnets     []string `json:"excludedSubnets"`
	ExtraSubnets        []string `json:"extraSubnets"`
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
	// Store excluded/extra subnets for next scan
	cachedExcluded = pushResp.Config.ExcludedSubnets
	cachedExtra = pushResp.Config.ExtraSubnets
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
