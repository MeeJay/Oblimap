//go:build !windows

package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"text/template"
	"time"
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

const freebsdRCDTpl = `#!/bin/sh
#
# PROVIDE: oblimap_probe
# REQUIRE: NETWORKING
# KEYWORD: shutdown

. /etc/rc.subr

name="oblimap_probe"
rcvar="oblimap_probe_enable"
command="/usr/local/bin/oblimap-probe"
pidfile="/var/run/${name}.pid"

start_cmd="${name}_start"
stop_cmd="${name}_stop"

oblimap_probe_start()
{
    /usr/sbin/daemon -p ${pidfile} -o /var/log/oblimap-probe.log ${command}
    echo "Started ${name}."
}

oblimap_probe_stop()
{
    if [ -f ${pidfile} ]; then
        kill $(cat ${pidfile}) 2>/dev/null
        rm -f ${pidfile}
        echo "Stopped ${name}."
    fi
}

load_rc_config $name
: ${oblimap_probe_enable:=NO}
run_rc_command "$1"
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
	case "freebsd":
		return installFreeBSD(exePath)
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

func installFreeBSD(exePath string) error {
	dest := "/usr/local/bin/oblimap-probe"
	if exePath != dest {
		if err := copyFile(exePath, dest); err != nil {
			return fmt.Errorf("copy binary: %w", err)
		}
		if err := os.Chmod(dest, 0755); err != nil {
			return err
		}
	}

	// Write rc.d script
	tpl := template.Must(template.New("rcd").Parse(freebsdRCDTpl))
	rcdPath := "/usr/local/etc/rc.d/oblimap_probe"
	f, err := os.Create(rcdPath)
	if err != nil {
		return fmt.Errorf("create rc.d script: %w", err)
	}
	if err := tpl.Execute(f, nil); err != nil {
		f.Close()
		return err
	}
	f.Close()
	if err := os.Chmod(rcdPath, 0755); err != nil {
		return err
	}

	// Enable and start
	if out, err := exec.Command("sysrc", "oblimap_probe_enable=YES").CombinedOutput(); err != nil {
		log.Printf("sysrc enable: %s", out)
	}
	if out, err := exec.Command("service", "oblimap_probe", "start").CombinedOutput(); err != nil {
		return fmt.Errorf("start service: %v (%s)", err, out)
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
	case "freebsd":
		exec.Command("service", "oblimap_probe", "stop").Run()  //nolint
		exec.Command("sysrc", "-x", "oblimap_probe_enable").Run() //nolint
		os.Remove("/usr/local/etc/rc.d/oblimap_probe")
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

func uninstallSelfFreeBSD(serverURL string) {
	_ = serverURL
	script := `#!/bin/sh
sleep 2
service oblimap_probe stop 2>/dev/null
sysrc -x oblimap_probe_enable 2>/dev/null
rm -f /usr/local/etc/rc.d/oblimap_probe
rm -rf /usr/local/bin/oblimap-probe
rm -rf /opt/oblimap-probe
`
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
	case "freebsd":
		uninstallSelfFreeBSD(serverURL)
	default:
		log.Printf("Uninstall not implemented for %s", runtime.GOOS)
	}
}

func applyUpdate(latestVersion string) {
	notifyUpdating()

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("Auto-update: cannot resolve executable path: %v", err)
		return
	}

	filename := fmt.Sprintf("oblimap-probe-%s-%s", runtime.GOOS, runtime.GOARCH)
	url := fmt.Sprintf("%s/api/probe/download/%s", cfg.ServerURL, filename)
	log.Printf("Auto-update: downloading %s → v%s", filename, latestVersion)

	client := &http.Client{Timeout: 120 * time.Second}
	dlResp, err := client.Get(url)
	if err != nil {
		log.Printf("Auto-update: download request failed: %v", err)
		return
	}
	defer dlResp.Body.Close()
	if dlResp.StatusCode != 200 {
		log.Printf("Auto-update: download failed (HTTP %d)", dlResp.StatusCode)
		return
	}

	tmpPath := exePath + ".new"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		log.Printf("Auto-update: cannot write temp file: %v", err)
		return
	}
	if _, err := io.Copy(f, dlResp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		log.Printf("Auto-update: download write error: %v", err)
		return
	}
	f.Close()

	if err := os.Rename(tmpPath, exePath); err != nil {
		os.Remove(tmpPath)
		log.Printf("Auto-update: rename failed: %v", err)
		return
	}

	log.Printf("Auto-update: updated to v%s, restarting...", latestVersion)
	restartWithNewBinary(exePath)
}
