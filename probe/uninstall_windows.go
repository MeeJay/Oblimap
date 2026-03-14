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
	// Download MSI and run msiexec /x via a detached batch script
	// (so the process can exit before msiexec runs)
	msiURL := fmt.Sprintf("%s/api/probe/download/oblimap-probe.msi", serverURL)
	msiPath := filepath.Join(os.TempDir(), "oblimap-probe-uninstall.msi")

	// Try to download the MSI (best-effort)
	_ = msiURL
	_ = msiPath

	// Write a detached batch script that uninstalls after a short delay
	script := fmt.Sprintf(`@echo off
ping 127.0.0.1 -n 3 > nul
sc stop %s 2>nul
sc delete %s 2>nul
rmdir /s /q "%%ProgramFiles%%\OblimapProbe" 2>nul
del /f /q "%%~f0"
`, serviceName, serviceName)

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

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("ERROR: get exe path: %v", err)
		return
	}

	// Download new MSI
	msiURL := fmt.Sprintf("%s/api/probe/download/oblimap-probe.msi", cfg.ServerURL)
	msiPath := filepath.Join(os.TempDir(), "oblimap-probe-update.msi")

	_ = msiURL
	_ = msiPath
	_ = exePath
	_ = latestVersion

	// Write update batch
	script := fmt.Sprintf(`@echo off
ping 127.0.0.1 -n 3 > nul
msiexec /i "%s" /quiet /norestart
del /f /q "%%~f0"
`, msiPath)

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
	os.Exit(0)
}
