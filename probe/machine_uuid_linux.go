//go:build linux

package main

import (
	"os"
	"strings"
)

func readMachineUUID() string {
	// systemd machine-id (stable, survives VM clones)
	if data, err := os.ReadFile("/etc/machine-id"); err == nil {
		uid := strings.TrimSpace(string(data))
		if len(uid) == 32 {
			// Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			return uid[0:8] + "-" + uid[8:12] + "-" + uid[12:16] + "-" + uid[16:20] + "-" + uid[20:32]
		}
	}
	// SMBIOS product UUID
	if data, err := os.ReadFile("/sys/class/dmi/id/product_uuid"); err == nil {
		uid := strings.TrimSpace(strings.ToLower(string(data)))
		if uid != "" {
			return uid
		}
	}
	return ""
}
