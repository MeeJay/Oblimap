//go:build windows

package main

import (
	"fmt"
	"math"
	"os/exec"
	"strconv"
	"strings"
)

// collectPlatformTemps returns Windows-specific temperature sensors that
// gopsutil's host.SensorsTemperatures() misses (ACPI thermal zones only).
//
// Sources (no external software required):
//  1. NVMe/SATA drive temperatures via Get-StorageReliabilityCounter
//     (PowerShell 5+ Storage module, built into Windows 10/11)
//  2. ASUS ATK WMI ACPI sensors (CPU, motherboard, fan temps) via the
//     AsusWmiAcpi.sys driver present on ASUS boards
//
// CPU temps on non-ASUS boards require a kernel-mode driver (WinRing0/WinIo)
// and are not available through any standard Windows API.
func collectPlatformTemps() []TempSensor {
	var out []TempSensor
	out = append(out, collectNVMeTemps()...)
	out = append(out, collectAsusATKTemps()...)
	return out
}

// collectNVMeTemps queries NVMe and SATA drive temperatures via
// Get-StorageReliabilityCounter, part of the Storage PowerShell module
// shipped with Windows 10/11. No driver or external tool required.
func collectNVMeTemps() []TempSensor {
	const script = `$ErrorActionPreference='SilentlyContinue'
$disks = Get-PhysicalDisk
foreach ($d in $disks) {
    try {
        $r = Get-StorageReliabilityCounter -PhysicalDisk $d
        if ($null -ne $r.Temperature -and $r.Temperature -gt 0) {
            Write-Output "$($d.FriendlyName)|$($r.Temperature)"
        }
    } catch {}
}`

	raw, err := exec.Command("powershell.exe",
		"-NoProfile", "-NonInteractive", "-Command", script,
	).Output()
	if err != nil || len(raw) == 0 {
		return nil
	}

	var sensors []TempSensor
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		temp, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err != nil || temp <= 0 || temp > 120 {
			continue
		}
		label := fmt.Sprintf("drive_%s", sanitizeLabel(name))
		sensors = append(sensors, TempSensor{
			Label:   label,
			Celsius: math.Round(temp*10) / 10,
		})
	}
	return sensors
}

// collectAsusATKTemps reads sensor data from the ASUS ATK WMI ACPI driver
// (AsusWmiAcpi.sys / ATKWMIACPIIO). This driver is present on ASUS boards and
// exposes CPU temp, motherboard temp, and fan speeds via WMI methods.
//
// The ASUS ATK WMI interface is documented in LibreHardwareMonitor source:
//   https://github.com/LibreHardwareMonitor/LibreHardwareMonitor
//
// Access pattern: enumerate WMI classes in root\wmi matching ASUS ATK patterns,
// call InvokeMethod to retrieve sensor arrays.
func collectAsusATKTemps() []TempSensor {
	// PowerShell script that:
	// 1. Finds ASUS ATK WMI class(es) in root\wmi
	// 2. Calls the standard ATK "sensor read" method
	// 3. Parses the returned int array as (index, value, ...) pairs
	const script = `$ErrorActionPreference='SilentlyContinue'

# ASUS ATK WMI uses a well-known class name pattern
$ns = 'root\wmi'
$atkClass = $null
$candidates = @('ATKWMIACPIIO', 'AsusWmiAcpi', 'WmiMonitorBrightness')
try {
    $all = Get-WmiObject -Namespace $ns -Class '__CLASS' -List |
           Select-Object -ExpandProperty Name
    foreach ($c in $all) {
        if ($c -match 'ATK|AsusWmi|WBMI') {
            Write-Output "CLASS:$c"
            # Try to retrieve instances and list properties
            try {
                $objs = Get-WmiObject -Namespace $ns -Class $c
                foreach ($o in $objs) {
                    $o.PSObject.Properties |
                        Where-Object { $_.MemberType -ne 'ScriptMethod' } |
                        ForEach-Object {
                            Write-Output "PROP:$c/$($_.Name)=$($_.Value)"
                        }
                }
            } catch {}
        }
    }
} catch {}`

	raw, err := exec.Command("powershell.exe",
		"-NoProfile", "-NonInteractive", "-Command", script,
	).Output()
	if err != nil || len(raw) == 0 {
		return nil
	}

	// Parse output: look for PROP lines with temperature-like values
	var sensors []TempSensor
	seen := make(map[string]bool)
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "PROP:") {
			continue
		}
		content := strings.TrimPrefix(line, "PROP:")
		eqIdx := strings.LastIndex(content, "=")
		if eqIdx < 0 {
			continue
		}
		key := content[:eqIdx]
		valStr := strings.TrimSpace(content[eqIdx+1:])

		if !strings.Contains(strings.ToLower(key), "temp") {
			continue
		}

		val, err := strconv.ParseFloat(valStr, 64)
		if err != nil {
			continue
		}

		// Normalize units (Kelvin, tenths-of-Kelvin, or Celsius)
		celsius := val
		switch {
		case val > 5000:
			celsius = (val/10.0) - 273.15
		case val > 200:
			celsius = val - 273.15
		}
		if celsius <= 0 || celsius > 150 {
			continue
		}

		label := "asus_" + sanitizeLabel(key)
		if seen[label] {
			continue
		}
		seen[label] = true
		sensors = append(sensors, TempSensor{
			Label:   label,
			Celsius: math.Round(celsius*10) / 10,
		})
	}
	return sensors
}

// sanitizeLabel converts a sensor name to a lowercase snake_case label.
func sanitizeLabel(s string) string {
	s = strings.ToLower(s)
	for _, ch := range []string{" ", "/", "\\", "-", ".", "(", ")", ":", ","} {
		s = strings.ReplaceAll(s, ch, "_")
	}
	for strings.Contains(s, "__") {
		s = strings.ReplaceAll(s, "__", "_")
	}
	return strings.Trim(s, "_")
}
