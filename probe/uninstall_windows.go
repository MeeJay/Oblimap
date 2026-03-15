//go:build windows

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func performUninstall(serverURL string) {
	// Download the MSI and use msiexec /x to uninstall cleanly
	msiURL := fmt.Sprintf("%s/api/probe/download/oblimap-probe.msi", serverURL)
	msiPath := filepath.Join(os.TempDir(), "oblimap-probe-uninstall.msi")

	if err := downloadFile(msiURL, msiPath); err != nil {
		log.Printf("WARN: could not download MSI for uninstall (%v) — falling back to sc delete", err)
		// Fallback: stop + delete service directly
		script := fmt.Sprintf(`@echo off
ping 127.0.0.1 -n 3 > nul
sc stop %s 2>nul
sc delete %s 2>nul
rmdir /s /q "%%ProgramFiles%%\OblimapProbe" 2>nul
del /f /q "%%~f0"
`, serviceName, serviceName)
		batchPath := filepath.Join(os.TempDir(), "oblimap-uninstall.bat")
		if err2 := os.WriteFile(batchPath, []byte(script), 0644); err2 != nil {
			log.Printf("ERROR: write uninstall batch: %v", err2)
			return
		}
		cmd := exec.Command("cmd.exe", "/c", "start", "", "/b", batchPath)
		cmd.Dir = os.TempDir()
		if err2 := cmd.Start(); err2 != nil {
			log.Printf("ERROR: start uninstall batch: %v", err2)
		}
		_ = cmd.Process.Release()
		time.Sleep(500 * time.Millisecond)
		return
	}

	// MSI uninstall via detached batch script (process must exit first)
	script := fmt.Sprintf(`@echo off
ping 127.0.0.1 -n 3 > nul
msiexec /x "%s" /quiet /norestart
del /f /q "%s"
del /f /q "%%~f0"
`, msiPath, msiPath)

	batchPath := filepath.Join(os.TempDir(), "oblimap-uninstall.bat")
	if err := os.WriteFile(batchPath, []byte(script), 0644); err != nil {
		log.Printf("ERROR: write uninstall batch: %v", err)
		return
	}

	cmd := exec.Command("cmd.exe", "/c", "start", "", "/b", batchPath)
	cmd.Dir = os.TempDir()
	if err := cmd.Start(); err != nil {
		log.Printf("ERROR: start uninstall batch: %v", err)
		return
	}
	_ = cmd.Process.Release()
	time.Sleep(500 * time.Millisecond)
}

func applyUpdate(latestVersion string) {
	notifyUpdating()

	// Download new MSI
	msiURL := fmt.Sprintf("%s/api/probe/download/oblimap-probe.msi", cfg.ServerURL)
	msiPath := filepath.Join(os.TempDir(), "oblimap-probe-update.msi")

	log.Printf("Auto-update: downloading MSI → v%s", latestVersion)
	if err := downloadFile(msiURL, msiPath); err != nil {
		log.Printf("Auto-update: MSI download failed: %v", err)
		return
	}

	// Launch msiexec via a detached batch script — the script outlives the
	// service process. msiexec stops the service, installs the new version,
	// then restarts it.
	script := fmt.Sprintf(`@echo off
ping 127.0.0.1 -n 3 > nul
msiexec /i "%s" /quiet /norestart SERVERURL="%s" APIKEY="%s"
del /f /q "%s"
del /f /q "%%~f0"
`, msiPath, cfg.ServerURL, cfg.APIKey, msiPath)

	batchPath := filepath.Join(os.TempDir(), "oblimap-update.bat")
	if err := os.WriteFile(batchPath, []byte(script), 0644); err != nil {
		log.Printf("ERROR: write update batch: %v", err)
		return
	}

	cmd := exec.Command("cmd.exe", "/c", "start", "", "/b", batchPath)
	if err := cmd.Start(); err != nil {
		log.Printf("ERROR: launch update batch: %v", err)
		return
	}
	_ = cmd.Process.Release()

	log.Printf("Auto-update: MSI update to v%s initiated — service will restart shortly...", latestVersion)
	os.Exit(0)
}
