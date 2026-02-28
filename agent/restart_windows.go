//go:build windows

package main

import "os"

// restartWithNewBinary on Windows simply exits — the restart is already
// handled by the detached batch script written by applyWindowsUpdate():
//
//  1. Old exe downloads  obliview-agent.exe.new
//  2. Old exe writes %TEMP%\obliview-update.bat  and launches it detached
//  3. Old exe calls restartWithNewBinary() → os.Exit(0)   (service stops)
//  4. Batch waits 4 s, sc stop (redundant safety), waits 2 s
//  5. Batch: move /y obliview-agent.exe.new obliview-agent.exe
//     (both files are unlocked — old exe exited, new exe was never started)
//  6. Batch: sc start ObliviewAgent  →  service restarts with new binary
func restartWithNewBinary(_ string) {
	os.Exit(0)
}
