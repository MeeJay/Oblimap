//go:build !linux

package main

import (
	"bufio"
	"bytes"
	"os/exec"
	"regexp"
	"strings"
)

// macPattern matches standard MAC address formats: aa:bb:cc:dd:ee:ff or aa-bb-cc-dd-ee-ff
var macPattern = regexp.MustCompile(`([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}`)

// ipPattern matches IPv4 addresses
var ipPattern = regexp.MustCompile(`\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)

// readARPTable runs "arp -a" and parses the output on Windows/macOS.
// Returns a map of ip → mac (uppercase, colon-separated).
func readARPTable() map[string]string {
	result := make(map[string]string)

	out, err := exec.Command("arp", "-a").Output()
	if err != nil {
		return result
	}

	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		line := scanner.Text()

		ipMatch := ipPattern.FindString(line)
		macMatch := macPattern.FindString(line)

		if ipMatch == "" || macMatch == "" {
			continue
		}

		// Normalize MAC to uppercase colon-separated
		mac := strings.ToUpper(macMatch)
		mac = strings.ReplaceAll(mac, "-", ":")

		// Skip broadcast / incomplete
		if mac == "FF:FF:FF:FF:FF:FF" || mac == "00:00:00:00:00:00" {
			continue
		}

		result[ipMatch] = mac
	}
	return result
}
