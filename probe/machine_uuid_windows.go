//go:build windows

package main

import (
	"log"
	"os/exec"
	"strings"
)

func readMachineUUID() string {
	// Try Get-CimInstance (PowerShell 3+)
	out, err := exec.Command("powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_ComputerSystemProduct).UUID",
	).Output()
	if err == nil {
		uid := strings.TrimSpace(string(out))
		if uid != "" && uid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" {
			return strings.ToLower(uid)
		}
	}

	// Fallback: wmic
	out, err = exec.Command("wmic", "csproduct", "get", "UUID", "/value").Output()
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.HasPrefix(line, "UUID=") {
				uid := strings.TrimSpace(strings.TrimPrefix(line, "UUID="))
				if uid != "" && uid != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" {
					return strings.ToLower(uid)
				}
			}
		}
	}

	log.Println("WARN: could not read hardware UUID on Windows")
	return ""
}
