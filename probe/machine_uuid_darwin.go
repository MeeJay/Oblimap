//go:build darwin

package main

import (
	"os/exec"
	"strings"
)

func readMachineUUID() string {
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "IOPlatformUUID") {
			parts := strings.Split(line, "\"")
			for i, p := range parts {
				if strings.Contains(p, "IOPlatformUUID") && i+2 < len(parts) {
					return strings.ToLower(parts[i+2])
				}
			}
		}
	}
	return ""
}
