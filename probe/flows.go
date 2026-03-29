package main

import (
	"bufio"
	"log"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// FlowEntry represents a single active TCP connection observed on this machine.
type FlowEntry struct {
	SourceIP   string `json:"sourceIp"`
	SourcePort int    `json:"sourcePort,omitempty"`
	DestIP     string `json:"destIp"`
	DestPort   int    `json:"destPort"`
	Protocol   string `json:"protocol"`
	Process    string `json:"process,omitempty"`
}

const maxFlowEntries = 10000

// collectFlows returns active TCP connections visible from this machine.
func collectFlows() []FlowEntry {
	switch runtime.GOOS {
	case "linux":
		return collectFlowsLinux()
	case "windows":
		return collectFlowsWindows()
	case "darwin":
		return collectFlowsDarwin()
	default:
		log.Printf("WARN: flow collection not supported on %s", runtime.GOOS)
		return nil
	}
}

// flowKey is used for deduplication by (sourceIP, destIP, destPort, protocol).
type flowKey struct {
	sourceIP string
	destIP   string
	destPort int
	protocol string
}

func isLoopback(ip string) bool {
	return ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "127.")
}

// splitHostPort splits "ip:port" into (ip, port). Returns ("", 0) on failure.
func splitHostPort(addr string) (string, int) {
	// Handle IPv6 bracket notation like [::1]:port
	if strings.HasPrefix(addr, "[") {
		idx := strings.LastIndex(addr, "]:")
		if idx < 0 {
			return "", 0
		}
		ip := addr[1:idx]
		port, err := strconv.Atoi(addr[idx+2:])
		if err != nil {
			return "", 0
		}
		return ip, port
	}
	idx := strings.LastIndex(addr, ":")
	if idx < 0 {
		return "", 0
	}
	ip := addr[:idx]
	port, err := strconv.Atoi(addr[idx+1:])
	if err != nil {
		return "", 0
	}
	return ip, port
}

// splitDarwinAddr splits macOS netstat address "192.168.1.10.45678" where
// the last dot separates the port from the IP.
func splitDarwinAddr(addr string) (string, int) {
	idx := strings.LastIndex(addr, ".")
	if idx < 0 {
		return "", 0
	}
	ip := addr[:idx]
	port, err := strconv.Atoi(addr[idx+1:])
	if err != nil {
		return "", 0
	}
	return ip, port
}

// collectFlowsLinux parses output from `ss -tnp`.
func collectFlowsLinux() []FlowEntry {
	out, err := exec.Command("ss", "-tnp").Output()
	if err != nil {
		log.Printf("WARN: ss -tnp failed: %v", err)
		return nil
	}

	seen := make(map[flowKey]bool)
	var flows []FlowEntry

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "ESTAB") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		srcIP, srcPort := splitHostPort(fields[3])
		dstIP, dstPort := splitHostPort(fields[4])

		if srcIP == "" || dstIP == "" || dstPort == 0 {
			continue
		}
		if isLoopback(srcIP) || isLoopback(dstIP) {
			continue
		}

		// Extract process name from users:(("name",pid=N,fd=N)) if present
		var process string
		for _, f := range fields[5:] {
			if strings.HasPrefix(f, "users:") {
				// Format: users:(("process_name",pid=1234,fd=5))
				start := strings.Index(f, "((\"")
				end := strings.Index(f, "\",")
				if start >= 0 && end > start+3 {
					process = f[start+3 : end]
				}
				break
			}
		}

		key := flowKey{sourceIP: srcIP, destIP: dstIP, destPort: dstPort, protocol: "tcp"}
		if seen[key] {
			continue
		}
		seen[key] = true

		flows = append(flows, FlowEntry{
			SourceIP:   srcIP,
			SourcePort: srcPort,
			DestIP:     dstIP,
			DestPort:   dstPort,
			Protocol:   "tcp",
			Process:    process,
		})

		if len(flows) >= maxFlowEntries {
			break
		}
	}

	log.Printf("Collected %d unique network flows", len(flows))
	return flows
}

// collectFlowsWindows parses output from `netstat -ano`.
func collectFlowsWindows() []FlowEntry {
	out, err := exec.Command("netstat", "-ano").Output()
	if err != nil {
		log.Printf("WARN: netstat -ano failed: %v", err)
		return nil
	}

	seen := make(map[flowKey]bool)
	var flows []FlowEntry

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, "ESTABLISHED") {
			continue
		}
		fields := strings.Fields(line)
		// Expected: TCP  local_addr  foreign_addr  ESTABLISHED  PID
		if len(fields) < 5 {
			continue
		}
		if !strings.EqualFold(fields[0], "TCP") {
			continue
		}

		srcIP, srcPort := splitHostPort(fields[1])
		dstIP, dstPort := splitHostPort(fields[2])

		if srcIP == "" || dstIP == "" || dstPort == 0 {
			continue
		}
		if isLoopback(srcIP) || isLoopback(dstIP) {
			continue
		}

		pid := fields[4]

		key := flowKey{sourceIP: srcIP, destIP: dstIP, destPort: dstPort, protocol: "tcp"}
		if seen[key] {
			continue
		}
		seen[key] = true

		flows = append(flows, FlowEntry{
			SourceIP:   srcIP,
			SourcePort: srcPort,
			DestIP:     dstIP,
			DestPort:   dstPort,
			Protocol:   "tcp",
			Process:    pid,
		})

		if len(flows) >= maxFlowEntries {
			break
		}
	}

	log.Printf("Collected %d unique network flows", len(flows))
	return flows
}

// collectFlowsDarwin parses output from `netstat -anp tcp`.
func collectFlowsDarwin() []FlowEntry {
	out, err := exec.Command("netstat", "-anp", "tcp").Output()
	if err != nil {
		log.Printf("WARN: netstat -anp tcp failed: %v", err)
		return nil
	}

	seen := make(map[flowKey]bool)
	var flows []FlowEntry

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, "ESTABLISHED") {
			continue
		}
		fields := strings.Fields(line)
		// Expected: tcp4  0  0  local_addr  foreign_addr  ESTABLISHED
		if len(fields) < 6 {
			continue
		}
		if !strings.HasPrefix(fields[0], "tcp") {
			continue
		}

		srcIP, srcPort := splitDarwinAddr(fields[3])
		dstIP, dstPort := splitDarwinAddr(fields[4])

		if srcIP == "" || dstIP == "" || dstPort == 0 {
			continue
		}
		if isLoopback(srcIP) || isLoopback(dstIP) {
			continue
		}

		key := flowKey{sourceIP: srcIP, destIP: dstIP, destPort: dstPort, protocol: "tcp"}
		if seen[key] {
			continue
		}
		seen[key] = true

		flows = append(flows, FlowEntry{
			SourceIP:   srcIP,
			SourcePort: srcPort,
			DestIP:     dstIP,
			DestPort:   dstPort,
			Protocol:   "tcp",
		})

		if len(flows) >= maxFlowEntries {
			break
		}
	}

	log.Printf("Collected %d unique network flows", len(flows))
	return flows
}
