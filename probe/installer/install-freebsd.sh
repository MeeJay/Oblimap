#!/bin/sh
# Oblimap Probe Installer for FreeBSD / OPNsense
# Usage: fetch -o - "https://your-server/api/probe/installer/freebsd?key=<apikey>" | sh
# Or:    sh install-freebsd.sh --url https://your-server --key <apikey>

set -e

SERVER_URL="__SERVER_URL__"
API_KEY="__API_KEY__"
INSTALL_DIR="/opt/oblimap-probe"
SERVICE_NAME="oblimap_probe"
BINARY_NAME="oblimap-probe"

# Parse args (override injected values)
while [ $# -gt 0 ]; do
  case "$1" in
    --url)   SERVER_URL="$2"; shift 2 ;;
    --url=*) SERVER_URL="${1#*=}"; shift ;;
    --key)   API_KEY="$2"; shift 2 ;;
    --key=*) API_KEY="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

if [ -z "$SERVER_URL" ] || [ "$SERVER_URL" = "__SERVER_URL__" ]; then
  echo "Error: --url is required"; exit 1
fi
if [ -z "$API_KEY" ] || [ "$API_KEY" = "__API_KEY__" ]; then
  echo "Error: --key is required"; exit 1
fi

echo "=============================="
echo " Oblimap Probe Installer"
echo " FreeBSD / OPNsense"
echo "=============================="
echo "Server URL : $SERVER_URL"
echo "Install dir: $INSTALL_DIR"
echo ""

# ── 1. Detect architecture ────────────────────────────────────────────────────

ARCH=$(uname -m)
case "$ARCH" in
  amd64|x86_64) BINARY_SUFFIX="freebsd-amd64" ;;
  *)
    echo "Unsupported architecture: $ARCH (supported: amd64)"
    exit 1
    ;;
esac

echo "[1/4] Architecture: $ARCH"

# ── 2. Download binary ────────────────────────────────────────────────────────

echo "[2/4] Downloading probe binary..."
mkdir -p "$INSTALL_DIR"

# FreeBSD ships with fetch; use curl as fallback
if command -v fetch >/dev/null 2>&1; then
  fetch -o "$INSTALL_DIR/$BINARY_NAME" "${SERVER_URL}/api/probe/download/oblimap-probe-${BINARY_SUFFIX}"
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL "${SERVER_URL}/api/probe/download/oblimap-probe-${BINARY_SUFFIX}" \
    -o "$INSTALL_DIR/$BINARY_NAME"
else
  echo "Error: neither fetch nor curl found"
  exit 1
fi
chmod +x "$INSTALL_DIR/$BINARY_NAME"

# ── 3. Write config ───────────────────────────────────────────────────────────

echo "[3/4] Writing configuration..."
mkdir -p "/etc/oblimap-probe"

# Generate device UUID from kern.hostuuid (FreeBSD) or fallback
DEVICE_UUID=$(sysctl -n kern.hostuuid 2>/dev/null || \
              python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || \
              cat /dev/urandom | od -An -tx1 -N16 | tr -d ' \n' | \
              sed 's/\(.\{8\}\)\(.\{4\}\)\(.\{4\}\)\(.\{4\}\)\(.\{12\}\)/\1-\2-\3-\4-\5/')

cat > "/etc/oblimap-probe/config.json" <<EOF
{
  "serverUrl": "$SERVER_URL",
  "apiKey": "$API_KEY",
  "deviceUuid": "$DEVICE_UUID",
  "scanIntervalSeconds": 300
}
EOF

# ── 4. Install rc.d service ──────────────────────────────────────────────────

echo "[4/4] Installing service..."

cat > "/usr/local/etc/rc.d/${SERVICE_NAME}" <<'RCDEOF'
#!/bin/sh
#
# PROVIDE: oblimap_probe
# REQUIRE: NETWORKING
# KEYWORD: shutdown

. /etc/rc.subr

name="oblimap_probe"
rcvar="oblimap_probe_enable"
command="__INSTALL_DIR__/__BINARY_NAME__"
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
RCDEOF

# Inject actual paths into rc.d script
sed -i '' "s|__INSTALL_DIR__|${INSTALL_DIR}|g" "/usr/local/etc/rc.d/${SERVICE_NAME}" 2>/dev/null || \
  sed -i "s|__INSTALL_DIR__|${INSTALL_DIR}|g" "/usr/local/etc/rc.d/${SERVICE_NAME}"
sed -i '' "s|__BINARY_NAME__|${BINARY_NAME}|g" "/usr/local/etc/rc.d/${SERVICE_NAME}" 2>/dev/null || \
  sed -i "s|__BINARY_NAME__|${BINARY_NAME}|g" "/usr/local/etc/rc.d/${SERVICE_NAME}"

chmod +x "/usr/local/etc/rc.d/${SERVICE_NAME}"

# Enable and start
sysrc ${SERVICE_NAME}_enable=YES
service ${SERVICE_NAME} start

echo ""
echo "=============================="
echo " Installation complete!"
echo " The probe will appear in"
echo " the Oblimap admin panel"
echo " once approved."
echo ""
echo " To uninstall:"
echo "   service ${SERVICE_NAME} stop"
echo "   sysrc -x ${SERVICE_NAME}_enable"
echo "   rm /usr/local/etc/rc.d/${SERVICE_NAME}"
echo "   rm -rf ${INSTALL_DIR}"
echo "   rm -rf /etc/oblimap-probe"
echo "=============================="
