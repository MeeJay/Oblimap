//go:build !windows

package main

// collectPlatformTemps is a no-op on non-Windows platforms.
// Temperature collection on Linux/macOS is handled by gopsutil's
// host.SensorsTemperatures() which uses /sys/class/thermal, lm-sensors,
// and similar OS-native interfaces.
func collectPlatformTemps() []TempSensor { return nil }
