//go:build !windows && !linux && !darwin && !freebsd

package main

func readMachineUUID() string {
	return ""
}
