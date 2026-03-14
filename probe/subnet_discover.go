package main

import (
	"log"
	"net"
)

// discoverSubnets returns the list of local IPv4 subnets to scan.
// It enumerates all network interfaces, finds IPv4 addresses, and returns their subnets.
// Extra subnets from the server config are appended.
// Subnets in cachedExcluded are filtered out.
func discoverSubnets(_ int) []*net.IPNet {
	var subnets []*net.IPNet
	seen := make(map[string]bool)

	ifaces, err := net.Interfaces()
	if err != nil {
		log.Printf("WARN: could not list interfaces: %v", err)
		return nil
	}

	for _, iface := range ifaces {
		// Skip loopback, down, and virtual interfaces
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		if isVirtualInterface(iface.Name) {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ipNet *net.IPNet
			switch v := addr.(type) {
			case *net.IPNet:
				ipNet = v
			case *net.IPAddr:
				ipNet = &net.IPNet{IP: v.IP, Mask: v.IP.DefaultMask()}
			}
			if ipNet == nil {
				continue
			}

			ip4 := ipNet.IP.To4()
			if ip4 == nil {
				continue // Skip IPv6
			}

			// Get the network address
			networkIP := ip4.Mask(ipNet.Mask)
			subnet := &net.IPNet{IP: networkIP, Mask: ipNet.Mask}
			key := subnet.String()

			if seen[key] {
				continue
			}
			seen[key] = true

			log.Printf("Discovered local subnet: %s (interface: %s)", key, iface.Name)
			subnets = append(subnets, subnet)
		}
	}

	// Append extra subnets from server config
	for _, extra := range cachedExtra {
		_, subnet, err := net.ParseCIDR(extra)
		if err != nil {
			log.Printf("WARN: invalid extra subnet %q: %v", extra, err)
			continue
		}
		key := subnet.String()
		if !seen[key] {
			seen[key] = true
			log.Printf("Adding extra subnet: %s", key)
			subnets = append(subnets, subnet)
		}
	}

	return subnets
}

// isVirtualInterface returns true for known virtual/tunnel interfaces to skip.
func isVirtualInterface(name string) bool {
	prefixes := []string{
		"docker", "br-", "veth", "virbr", "lo", "tun", "tap",
		"vmnet", "vboxnet", "utun", "ipsec", "ppp", "wg",
	}
	for _, prefix := range prefixes {
		if len(name) >= len(prefix) && name[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}
