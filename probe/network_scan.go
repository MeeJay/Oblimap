package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

// ─── Host IP enumeration ──────────────────────────────────────────────────────

// hostIPs returns all usable host IPs in a subnet (excludes network + broadcast).
// Limited to subnets with at most 4094 hosts (/20).
func hostIPs(subnet *net.IPNet) []net.IP {
	ones, bits := subnet.Mask.Size()
	hostBits := bits - ones
	if hostBits > 12 {
		// Too large — warn and skip
		log.Printf("WARN: subnet %s (/%d) is too large to scan, skipping", subnet, ones)
		return nil
	}

	ip4 := subnet.IP.To4()
	if ip4 == nil {
		return nil // IPv6 not supported
	}

	netAddr := binary.BigEndian.Uint32(ip4)
	mask := binary.BigEndian.Uint32([]byte(subnet.Mask))
	broadcast := netAddr | ^mask

	var ips []net.IP
	for addr := netAddr + 1; addr < broadcast; addr++ {
		buf := make(net.IP, 4)
		binary.BigEndian.PutUint32(buf, addr)
		ips = append(ips, buf)
	}
	return ips
}

// ─── Network Scan ─────────────────────────────────────────────────────────────

const pingConcurrency = 256
const tcpTimeout = 250 * time.Millisecond
const dnsTimeout = 1 * time.Second

// scanSubnet discovers all reachable devices in a subnet.
// Strategy:
//  1. Concurrent TCP port scan to populate OS ARP cache
//  2. Read ARP cache for MAC addresses (works without root)
//  3. Reverse DNS lookup for hostnames
func scanSubnet(subnet *net.IPNet) []DiscoveredDevice {
	ips := hostIPs(subnet)
	if len(ips) == 0 {
		return nil
	}

	log.Printf("Scanning %s (%d hosts)…", subnet, len(ips))

	// Step 1: Concurrent TCP probe to populate ARP cache
	aliveIPs := tcpScan(ips)

	// Step 2: Read ARP table — gives us MAC for any IP the OS has communicated with
	arpTable := readARPTable()

	// Merge: an IP is interesting if it's in ARP table (seen by OS)
	// or if it responded to TCP
	seenIPs := make(map[string]bool)
	for ip := range aliveIPs {
		seenIPs[ip] = true
	}
	for ip := range arpTable {
		if subnet.Contains(net.ParseIP(ip)) {
			seenIPs[ip] = true
		}
	}

	if len(seenIPs) == 0 {
		return nil
	}

	// Step 3: Reverse DNS (concurrent)
	hostnameMap := resolveHostnames(seenIPs)

	// Step 4 (optional): Full port scan for alive IPs
	var portScanResults map[string][]int
	if cachedPortScanEnabled && len(cachedPortScanPorts) > 0 {
		log.Printf("  Port scanning %d alive hosts on %d ports…", len(aliveIPs), len(cachedPortScanPorts))
		portScanResults = tcpScanPorts(aliveIPs, cachedPortScanPorts)
	}

	// Step 5: Build device list
	var devices []DiscoveredDevice
	for ipStr := range seenIPs {
		d := DiscoveredDevice{
			IP:       ipStr,
			MAC:      arpTable[ipStr],
			Hostname: hostnameMap[ipStr],
			IsOnline: aliveIPs[ipStr] || arpTable[ipStr] != "",
		}
		if portScanResults != nil {
			if ports, ok := portScanResults[ipStr]; ok {
				d.OpenPorts = ports
			} else {
				d.OpenPorts = []int{} // scanned but nothing open
			}
		}
		devices = append(devices, d)
	}

	log.Printf("  → %d devices found in %s", len(devices), subnet)
	return devices
}

// ─── TCP Port Scan ────────────────────────────────────────────────────────────

// Common ports to try — a device is "online" if any port responds.
var probePorts = []int{22, 80, 443, 445, 8080, 8443, 554, 21, 23, 3389, 9100, 515, 631}

// tcpScan concurrently probes all IPs on common ports.
// Returns a map of ip→true for IPs that responded.
func tcpScan(ips []net.IP) map[string]bool {
	results := make(map[string]bool)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, pingConcurrency)

	for _, ip := range ips {
		wg.Add(1)
		sem <- struct{}{}
		go func(target net.IP) {
			defer wg.Done()
			defer func() { <-sem }()

			ipStr := target.String()
			for _, port := range probePorts {
				addr := fmt.Sprintf("%s:%d", ipStr, port)
				conn, err := net.DialTimeout("tcp", addr, tcpTimeout)
				if err == nil {
					conn.Close()
					mu.Lock()
					results[ipStr] = true
					mu.Unlock()
					return // Found online on one port — no need to check others
				}
			}
		}(cloneIP(ip))
	}

	wg.Wait()
	return results
}

// ─── Full Port Scan ───────────────────────────────────────────────────────────

// tcpScanPorts scans all given ports for each IP in the aliveIPs set.
// Returns a map of ip → sorted list of open port numbers.
// Only called when cachedPortScanEnabled is true.
func tcpScanPorts(aliveIPs map[string]bool, ports []int) map[string][]int {
	if len(ports) == 0 {
		return nil
	}
	results := make(map[string][]int)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, pingConcurrency)

	for ipStr := range aliveIPs {
		wg.Add(1)
		sem <- struct{}{}
		go func(target string) {
			defer wg.Done()
			defer func() { <-sem }()

			var open []int
			for _, port := range ports {
				addr := fmt.Sprintf("%s:%d", target, port)
				conn, err := net.DialTimeout("tcp", addr, tcpTimeout)
				if err == nil {
					conn.Close()
					open = append(open, port)
				}
			}
			if len(open) > 0 {
				mu.Lock()
				results[target] = open
				mu.Unlock()
			}
		}(ipStr)
	}

	wg.Wait()
	return results
}

// ─── Hostname Resolution ──────────────────────────────────────────────────────

func resolveHostnames(ips map[string]bool) map[string]string {
	const concurrency = 64
	results := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)

	resolver := &net.Resolver{}

	for ipStr := range ips {
		wg.Add(1)
		sem <- struct{}{}
		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()

			ctx, cancel := context.WithTimeout(context.Background(), dnsTimeout)
			defer cancel()

			names, err := resolver.LookupAddr(ctx, ip)
			if err != nil || len(names) == 0 {
				return
			}
			name := names[0]
			// Strip trailing dot from FQDN
			if len(name) > 0 && name[len(name)-1] == '.' {
				name = name[:len(name)-1]
			}
			mu.Lock()
			results[ip] = name
			mu.Unlock()
		}(ipStr)
	}

	wg.Wait()
	return results
}

// cloneIP returns a copy of a net.IP slice.
func cloneIP(ip net.IP) net.IP {
	if ip == nil {
		return nil
	}
	c := make(net.IP, len(ip))
	copy(c, ip)
	return c
}
