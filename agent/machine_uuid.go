package main

import (
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var uuidRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var zeroUUID = "00000000-0000-0000-0000-000000000000"

// normaliseUUID lowercases and validates a UUID string.
// Returns "" if the string is not a valid UUID or is the all-zeros sentinel.
func normaliseUUID(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == zeroUUID || !uuidRe.MatchString(s) {
		return ""
	}
	return s
}

// getMachineUUID returns a stable hardware UUID for this machine.
// Calls the platform-specific readMachineUUID() and falls back to ""
// if the platform doesn't support it or the result is invalid.
func getMachineUUID() string {
	return readMachineUUID()
}

// ── Cross-product identity override ─────────────────────────────────────────
// Shared across EVERY Obli* agent (Obliance, Obliview, Oblimap, Obliguard …)
// so regenerating the identity ONCE — via any Obli* "fix duplicate agent ID"
// script — re-homes every tool on the box at the same time. Brand-agnostic
// on purpose: lives under a neutral "Oblitools" namespace, not any single
// product's config dir.
//
//   Windows: %PROGRAMDATA%\Oblitools\device-uuid-override
//   Unix:    /etc/oblitools/device-uuid-override
//
// The file holds a single UUID. When present + valid it takes precedence over
// the SMBIOS resolution below — the answer for Windows VMs cloned from a
// template (the SMBIOS UUID is hypervisor-set and unchangeable in-guest, so we
// override it here instead). Opt-in: absent file = unchanged behavior, so
// existing fleets never shift identity.
func oblitoolsOverridePath() string {
	if runtime.GOOS == "windows" {
		pd := os.Getenv("PROGRAMDATA")
		if pd == "" {
			pd = `C:\ProgramData`
		}
		return filepath.Join(pd, "Oblitools", "device-uuid-override")
	}
	return "/etc/oblitools/device-uuid-override"
}

// readUUIDOverride returns a validated override UUID if the shared Oblitools
// override file exists and holds a well-formed UUID; "" otherwise.
func readUUIDOverride() string {
	b, err := os.ReadFile(oblitoolsOverridePath())
	if err != nil {
		return ""
	}
	return normaliseUUID(strings.TrimSpace(string(b)))
}

// resolveDeviceUUID returns the best available UUID for this device.
//
// Priority:
//  1. Hardware UUID (SMBIOS / IOPlatformUUID / machine-id) — stable across reinstalls.
//  2. The previously stored UUID (carried over from config.json).
//  3. A freshly generated random UUID v4 (last resort).
//
// Passing "" as stored is fine for first-run scenarios.
func resolveDeviceUUID(stored string) string {
	// 0. Cross-product operator override (shared Oblitools location). Takes
	//    precedence so a single regen re-homes every Obli* agent on the box.
	//    Absent file → falls through unchanged.
	if ov := readUUIDOverride(); ov != "" {
		if ov != stored {
			log.Printf("Device UUID: using Oblitools override %s", ov)
		}
		return ov
	}

	if hw := getMachineUUID(); hw != "" {
		if hw != stored {
			log.Printf("Device UUID: using machine UUID %s", hw)
		}
		return hw
	}
	if stored != "" {
		return stored
	}
	fresh := generateUUID()
	log.Printf("Device UUID: hardware UUID unavailable, generated %s", fresh)
	return fresh
}
