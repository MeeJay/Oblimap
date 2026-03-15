//go:build !windows

package main

import (
	"fmt"
	"log"
	"os"
	"runtime"
)

// applyUpdate downloads the new probe binary and atomically replaces the
// current executable, then re-execs into the new binary (same PID on Unix
// via syscall.Exec, so no service manager gap).
//
// On systemd/launchd systems the service manager would also restart after
// os.Exit(0) — restartWithNewBinary handles both cases.
func applyUpdate(latestVersion string) {
	notifyUpdating()

	filename := fmt.Sprintf("oblimap-probe-%s-%s", runtime.GOOS, runtime.GOARCH)
	dlURL := fmt.Sprintf("%s/api/probe/download/%s", cfg.ServerURL, filename)

	log.Printf("Auto-update: downloading %s → v%s", filename, latestVersion)

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("Auto-update: cannot resolve executable path: %v", err)
		return
	}
	tmpPath := exePath + ".new"

	if err := downloadFile(dlURL, tmpPath); err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("Auto-update: download failed: %v", err)
		return
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("Auto-update: chmod failed: %v", err)
		return
	}
	if err := os.Rename(tmpPath, exePath); err != nil {
		_ = os.Remove(tmpPath)
		log.Printf("Auto-update: rename failed: %v", err)
		return
	}

	log.Printf("Auto-update: updated to v%s, restarting...", latestVersion)
	restartWithNewBinary(exePath)
}
