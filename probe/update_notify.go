package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// notifyUpdating fires a best-effort POST to tell the server this probe is about to update.
// This lets the UI show "Updating…" badge and suppress false offline alerts.
func notifyUpdating() {
	body, _ := json.Marshal(map[string]string{
		"probeUuid": cfg.DeviceUUID,
		"version":   ProbeVersion,
	})
	url := fmt.Sprintf("%s/api/probe/notifying-update", cfg.ServerURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", cfg.APIKey)
	req.Header.Set("X-Probe-UUID", cfg.DeviceUUID)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("WARN: notify updating failed: %v", err)
		return
	}
	resp.Body.Close()
}
