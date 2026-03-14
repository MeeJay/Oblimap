package main

import (
	"crypto/rand"
	"fmt"
	"log"
)

// resolveUUID returns the device UUID using this priority:
// 1. Hardware UUID (SMBIOS/machine-id/IOPlatformUUID) — stable across reboots
// 2. Previously stored UUID from config
// 3. Freshly generated random UUID v4
func resolveUUID() string {
	hw := readMachineUUID()
	if hw != "" {
		return hw
	}
	if cfg.DeviceUUID != "" {
		return cfg.DeviceUUID
	}
	id := generateUUID()
	log.Printf("WARN: no hardware UUID found, generated: %s", id)
	return id
}

func generateUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant bits
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%12x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
