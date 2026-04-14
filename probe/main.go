package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// ProbeVersion is the current version of the probe binary.
// This is overridden at build time: -ldflags "-X main.ProbeVersion=1.0.0"
var ProbeVersion = "1.0.0"

// Config holds the probe configuration persisted to disk.
type Config struct {
	ServerURL            string `json:"serverUrl"`
	APIKey               string `json:"apiKey"`
	DeviceUUID           string `json:"deviceUuid"`
	ScanIntervalSeconds  int    `json:"scanIntervalSeconds"`
	BackoffUntil         int64  `json:"backoffUntil"` // unix ms
	FlowAnalysisEnabled  bool   `json:"flowAnalysisEnabled"`
}

const defaultScanInterval = 300

var (
	configPath string
	cfg        Config
)

func configDir() string {
	switch runtime.GOOS {
	case "windows":
		d := os.Getenv("ProgramData")
		if d == "" {
			d = `C:\ProgramData`
		}
		return filepath.Join(d, "OblimapProbe")
	default:
		return "/etc/oblimap-probe"
	}
}

func loadConfig() {
	configPath = filepath.Join(configDir(), "config.json")
	data, err := os.ReadFile(configPath)
	if err == nil {
		if err2 := json.Unmarshal(data, &cfg); err2 != nil {
			log.Printf("WARN: could not parse config: %v", err2)
		}
	}
	if cfg.ScanIntervalSeconds == 0 {
		cfg.ScanIntervalSeconds = defaultScanInterval
	}
	// Restore cached flow analysis setting from persisted config
	cachedFlowAnalysisEnabled = cfg.FlowAnalysisEnabled
}

func saveConfig() {
	// Sync cached settings into config struct before persisting
	cfg.FlowAnalysisEnabled = cachedFlowAnalysisEnabled

	if err := os.MkdirAll(configDir(), 0750); err != nil {
		log.Printf("WARN: could not create config dir: %v", err)
		return
	}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.WriteFile(configPath, data, 0640); err != nil {
		log.Printf("WARN: could not save config: %v", err)
	}
}

// checkForUpdate calls GET /api/probe/version at startup and applies any
// available update immediately — before entering the main scan loop.
// During normal operation the server also piggybacks the latest version on
// every push response (handled in push.go), so this is only the startup check.
func checkForUpdate() {
	type versionResponse struct {
		Version string `json:"version"`
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(cfg.ServerURL + "/api/probe/version")
	if err != nil {
		log.Printf("Auto-update: startup version check failed: %v", err)
		return
	}
	defer resp.Body.Close()
	var info versionResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil || info.Version == "" {
		return
	}
	if isStrictlyNewer(info.Version, ProbeVersion) {
		log.Printf("Auto-update: new version %s available at startup, applying...", info.Version)
		applyUpdate(info.Version)
	}
}

func mainLoop() {
	// Resolve device UUID using the hardware-derived priority chain.
	// Always re-resolve on startup — if the hardware UUID changed (rare), we
	// pick up the new one; otherwise the resolver returns the same stable value.
	resolved := resolveDeviceUUID(cfg.DeviceUUID)
	if resolved != cfg.DeviceUUID {
		cfg.DeviceUUID = resolved
		saveConfig()
	}
	log.Printf("Oblimap Probe %s starting (UUID: %s)", ProbeVersion, cfg.DeviceUUID)

	// Check for a newer version before entering the scan loop.
	checkForUpdate()

	// Try WebSocket persistent connection first.
	// The probe must be registered via HTTP first (wsAvailable checks this).
	// Do one HTTP push to ensure registration, then switch to WS.
	log.Printf("Performing initial HTTP push for registration...")
	doPush()

	if wsAvailable() {
		log.Printf("Switching to WebSocket persistent connection")
		wsMainLoop() // Blocks, reconnects internally. Only returns on unrecoverable error.
		log.Printf("WebSocket loop exited, falling back to HTTP polling")
	}

	// HTTP polling fallback
	log.Printf("Using HTTP polling mode")
	for {
		if cfg.BackoffUntil > 0 && time.Now().UnixMilli() < cfg.BackoffUntil {
			wait := time.Until(time.UnixMilli(cfg.BackoffUntil))
			log.Printf("Backing off for %v", wait.Round(time.Second))
			time.Sleep(wait)
		}

		interval := doPush()

		if interval < 30 {
			interval = defaultScanInterval
		}
		log.Printf("Next scan in %ds", interval)
		time.Sleep(time.Duration(interval) * time.Second)
	}
}

func main() {
	var (
		serverURL = flag.String("server", "", "Oblimap server URL (e.g. https://oblimap.example.com)")
		apiKey    = flag.String("key", "", "API key (from Oblimap admin → Probes → API Keys)")
		install   = flag.Bool("install", false, "Install as system service")
		uninstall = flag.Bool("uninstall", false, "Uninstall system service")
		version   = flag.Bool("version", false, "Print version and exit")
	)
	flag.Parse()

	if *version {
		fmt.Printf("Oblimap Probe v%s (%s/%s)\n", ProbeVersion, runtime.GOOS, runtime.GOARCH)
		return
	}

	loadConfig()

	if *serverURL != "" {
		cfg.ServerURL = *serverURL
		saveConfig()
	}
	if *apiKey != "" {
		cfg.APIKey = *apiKey
		saveConfig()
	}

	if cfg.ServerURL == "" || cfg.APIKey == "" {
		fmt.Fprintf(os.Stderr, "Error: --server and --key are required on first run.\n")
		fmt.Fprintf(os.Stderr, "Example: oblimap-probe --server https://oblimap.example.com --key <your-api-key>\n")
		os.Exit(1)
	}

	if *install {
		if err := serviceInstall(); err != nil {
			fmt.Fprintf(os.Stderr, "Install error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Service installed and started.")
		return
	}

	if *uninstall {
		if err := serviceUninstall(); err != nil {
			fmt.Fprintf(os.Stderr, "Uninstall error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Service uninstalled.")
		return
	}

	// Run as service if launched by SCM, else run interactively
	runAsService(mainLoop)
}
