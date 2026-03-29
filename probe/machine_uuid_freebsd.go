//go:build freebsd

package main

import (
	"os/exec"
	"strings"
)

func readMachineUUID() string {
	out, err := exec.Command("sysctl", "-n", "kern.hostuuid").Output()
	if err != nil {
		return ""
	}
	uid := strings.TrimSpace(strings.ToLower(string(out)))
	if uid == "" {
		return ""
	}
	return uid
}
