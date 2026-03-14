//go:build linux

package main

import (
	"bufio"
	"os"
	"strings"
)

// readARPTable parses /proc/net/arp on Linux.
// Returns a map of ip → mac (uppercase, colon-separated).
func readARPTable() map[string]string {
	result := make(map[string]string)

	f, err := os.Open("/proc/net/arp")
	if err != nil {
		return result
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	// Skip header line
	scanner.Scan()
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 {
			continue
		}
		ip := fields[0]
		mac := strings.ToUpper(fields[3])
		// Skip incomplete entries
		if mac == "00:00:00:00:00:00" || mac == "" {
			continue
		}
		result[ip] = mac
	}
	return result
}
