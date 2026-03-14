//go:build !windows

package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"text/template"
)

func runAsService(mainFn func()) {
	mainFn()
}

// ─── Linux systemd service install ───────────────────────────────────────────

const linuxServiceTpl = `[Unit]
Description=Oblimap Network Probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={{.ExePath}}
Restart=always
RestartSec=10
StandardOutput=append:/var/log/oblimap-probe.log
StandardError=append:/var/log/oblimap-probe.log

[Install]
WantedBy=multi-user.target
`

const darwinPlistTpl = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.oblimap.probe</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{.ExePath}}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/oblimap-probe.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/oblimap-probe.log</string>
</dict>
</plist>
`

func serviceInstall() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable: %w", err)
	}

	switch runtime.GOOS {
	case "linux":
		return installLinux(exePath)
	case "darwin":
		return installDarwin(exePath)
	default:
		return errors.New("service install not supported on this platform")
	}
}

func installLinux(exePath string) error {
	// Copy binary to /usr/local/bin/oblimap-probe
	dest := "/usr/local/bin/oblimap-probe"
	if exePath != dest {
		if err := copyFile(exePath, dest); err != nil {
			return fmt.Errorf("copy binary: %w", err)
		}
		if err := os.Chmod(dest, 0755); err != nil {
			return err
		}
	}

	// Write systemd unit
	tpl := template.Must(template.New("svc").Parse(linuxServiceTpl))
	unitPath := "/etc/systemd/system/oblimap-probe.service"
	f, err := os.Create(unitPath)
	if err != nil {
		return fmt.Errorf("create unit file: %w", err)
	}
	if err := tpl.Execute(f, map[string]string{"ExePath": dest}); err != nil {
		f.Close()
		return err
	}
	f.Close()

	// Enable and start
	if out, err := exec.Command("systemctl", "daemon-reload").CombinedOutput(); err != nil {
		log.Printf("systemctl daemon-reload: %s", out)
	}
	if out, err := exec.Command("systemctl", "enable", "--now", "oblimap-probe").CombinedOutput(); err != nil {
		return fmt.Errorf("enable service: %v (%s)", err, out)
	}
	return nil
}

func installDarwin(exePath string) error {
	dest := "/usr/local/bin/oblimap-probe"
	if exePath != dest {
		if err := copyFile(exePath, dest); err != nil {
			return fmt.Errorf("copy binary: %w", err)
		}
		if err := os.Chmod(dest, 0755); err != nil {
			return err
		}
	}

	tpl := template.Must(template.New("plist").Parse(darwinPlistTpl))
	plistPath := "/Library/LaunchDaemons/com.oblimap.probe.plist"
	f, err := os.Create(plistPath)
	if err != nil {
		return fmt.Errorf("create plist: %w", err)
	}
	if err := tpl.Execute(f, map[string]string{"ExePath": dest}); err != nil {
		f.Close()
		return err
	}
	f.Close()

	out, err := exec.Command("launchctl", "load", "-w", plistPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("launchctl load: %v (%s)", err, out)
	}
	return nil
}

func serviceUninstall() error {
	switch runtime.GOOS {
	case "linux":
		exec.Command("systemctl", "stop", "oblimap-probe").Run()     //nolint
		exec.Command("systemctl", "disable", "oblimap-probe").Run()  //nolint
		os.Remove("/etc/systemd/system/oblimap-probe.service")
		exec.Command("systemctl", "daemon-reload").Run() //nolint
		return nil
	case "darwin":
		plist := "/Library/LaunchDaemons/com.oblimap.probe.plist"
		exec.Command("launchctl", "unload", plist).Run() //nolint
		os.Remove(plist)
		return nil
	default:
		return errors.New("service uninstall not supported on this platform")
	}
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0755)
}

func uninstallSelfLinux(serverURL string) {
	script := `#!/bin/sh
sleep 2
systemctl stop oblimap-probe 2>/dev/null || service oblimap-probe stop 2>/dev/null
systemctl disable oblimap-probe 2>/dev/null
rm -f /etc/systemd/system/oblimap-probe.service
systemctl daemon-reload 2>/dev/null
rm -rf /usr/local/bin/oblimap-probe
rm -rf /opt/oblimap-probe
`
	_ = serverURL
	scriptPath := "/tmp/oblimap-uninstall.sh"
	if err := os.WriteFile(scriptPath, []byte(script), 0700); err != nil {
		log.Printf("ERROR: write uninstall script: %v", err)
		return
	}
	cmd := exec.Command("/bin/sh", scriptPath)
	if err := cmd.Start(); err != nil {
		log.Printf("ERROR: start uninstall script: %v", err)
		return
	}
	cmd.Process.Release() //nolint
}

func uninstallSelfDarwin(serverURL string) {
	_ = serverURL
	exePath, _ := os.Executable()
	plist := "/Library/LaunchDaemons/com.oblimap.probe.plist"
	script := fmt.Sprintf(`#!/bin/sh
sleep 2
launchctl unload %s 2>/dev/null
rm -f %s
rm -f %s
`, plist, plist, exePath)

	scriptPath := "/tmp/oblimap-uninstall.sh"
	if err := os.WriteFile(scriptPath, []byte(script), 0700); err != nil {
		log.Printf("ERROR: write uninstall script: %v", err)
		return
	}
	cmd := exec.Command("/bin/sh", scriptPath)
	if err := cmd.Start(); err != nil {
		log.Printf("ERROR: start uninstall script: %v", err)
		return
	}
	cmd.Process.Release() //nolint
}

func performUninstall(serverURL string) {
	switch runtime.GOOS {
	case "linux":
		uninstallSelfLinux(serverURL)
	case "darwin":
		uninstallSelfDarwin(serverURL)
	default:
		log.Printf("Uninstall not implemented for %s", runtime.GOOS)
	}
}

func applyUpdate(latestVersion string) {
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("ERROR: get executable path: %v", err)
		return
	}

	arch := runtime.GOARCH
	platform := runtime.GOOS
	filename := fmt.Sprintf("oblimap-probe-%s-%s", platform, arch)
	if strings.Contains(filename, "windows") {
		filename += ".exe"
	}

	url := fmt.Sprintf("%s/api/probe/download/%s", cfg.ServerURL, filename)
	log.Printf("Downloading update from %s", url)

	// TODO: implement binary download + atomic replace + restart
	_ = latestVersion
	_ = url
	_ = exePath
	log.Printf("Update download not yet implemented on this platform")
}
