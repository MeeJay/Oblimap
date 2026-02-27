#!/bin/bash
# Obliview Agent Installer for Linux
# Usage: curl -fsSL "https://your-server/api/agent/installer/linux?key=<apikey>" | bash
# Or:    bash install.sh --url https://your-server --key <apikey>

set -e

SERVER_URL="__SERVER_URL__"
API_KEY="__API_KEY__"
INSTALL_DIR="/opt/obliview-agent"
CONFIG_DIR="/etc/obliview-agent"
SERVICE_NAME="obliview-agent"
NODE_VERSION="18"

# Parse args (override injected values)
for i in "$@"; do
  case $i in
    --url=*) SERVER_URL="${i#*=}" ;;
    --key=*) API_KEY="${i#*=}" ;;
    --url) SERVER_URL="$2"; shift ;;
    --key) API_KEY="$2"; shift ;;
  esac
done

if [ -z "$SERVER_URL" ] || [ "$SERVER_URL" = "__SERVER_URL__" ]; then
  echo "Error: --url is required"
  exit 1
fi
if [ -z "$API_KEY" ] || [ "$API_KEY" = "__API_KEY__" ]; then
  echo "Error: --key is required"
  exit 1
fi

echo "=============================="
echo " Obliview Agent Installer"
echo "=============================="
echo "Server URL : $SERVER_URL"
echo "Install dir: $INSTALL_DIR"
echo ""

# ── 1. Install Node.js if absent ─────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "[1/6] Installing Node.js ${NODE_VERSION}..."

  if [ -f /etc/redhat-release ]; then
    # CentOS / RHEL / Fedora
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    yum install -y nodejs
  elif [ -f /etc/debian_version ]; then
    # Debian / Ubuntu
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
  else
    echo "Unsupported distribution. Please install Node.js ${NODE_VERSION}+ manually."
    exit 1
  fi
else
  NODE_CURRENT=$(node --version | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_CURRENT" -lt 18 ]; then
    echo "Warning: Node.js ${NODE_CURRENT} detected, >= 18 recommended"
  fi
  echo "[1/6] Node.js already installed: $(node --version)"
fi

# ── 2. Create install directory ───────────────────────────────────────────────

echo "[2/6] Creating install directory..."
mkdir -p "$INSTALL_DIR/src"
mkdir -p "$CONFIG_DIR"

# ── 3. Download agent files ───────────────────────────────────────────────────

echo "[3/6] Downloading agent files..."
curl -fsSL "${SERVER_URL}/api/agent/download/agent.js" -o "$INSTALL_DIR/src/index.js"
curl -fsSL "${SERVER_URL}/api/agent/download/package.json" -o "$INSTALL_DIR/package.json"

# ── 4. Install npm dependencies ───────────────────────────────────────────────

echo "[4/6] Installing dependencies..."
cd "$INSTALL_DIR"
npm install --production --silent

# ── 5. Write config ───────────────────────────────────────────────────────────

echo "[5/6] Writing configuration..."
cat > "$CONFIG_DIR/config.json" <<EOF
{
  "serverUrl": "$SERVER_URL",
  "apiKey": "$API_KEY",
  "checkIntervalSeconds": 60,
  "agentVersion": "1.0.0"
}
EOF

# ── 6. Install and start service ─────────────────────────────────────────────

echo "[6/6] Installing service..."

if command -v systemctl &>/dev/null; then
  # systemd (CentOS 7+, Ubuntu 15+, Debian 8+)
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Obliview Monitoring Agent
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=root
ExecStart=$(command -v node) $INSTALL_DIR/src/index.js
StandardOutput=journal
StandardError=journal
SyslogIdentifier=obliview-agent
WorkingDirectory=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  echo ""
  echo "Service status:"
  systemctl status "$SERVICE_NAME" --no-pager -l || true

elif [ -d /etc/init.d ]; then
  # SysVinit fallback (CentOS 6)
  cat > "/etc/init.d/${SERVICE_NAME}" <<'EOF'
#!/bin/bash
# chkconfig: 2345 80 20
# description: Obliview Agent
NODE_BIN=$(which node)
DAEMON="$NODE_BIN /opt/obliview-agent/src/index.js"
PIDFILE=/var/run/obliview-agent.pid
case "$1" in
  start)
    $DAEMON &
    echo $! > $PIDFILE
    echo "Obliview Agent started"
    ;;
  stop)
    kill $(cat $PIDFILE) 2>/dev/null
    rm -f $PIDFILE
    echo "Obliview Agent stopped"
    ;;
  restart)
    $0 stop; $0 start
    ;;
  status)
    if [ -f $PIDFILE ] && kill -0 $(cat $PIDFILE) 2>/dev/null; then
      echo "Obliview Agent is running"
    else
      echo "Obliview Agent is not running"
    fi
    ;;
esac
EOF
  chmod +x "/etc/init.d/${SERVICE_NAME}"
  chkconfig --add "$SERVICE_NAME"
  service "$SERVICE_NAME" start
else
  echo "Warning: No service manager found. Start manually with:"
  echo "  node $INSTALL_DIR/src/index.js &"
fi

echo ""
echo "=============================="
echo " Installation complete!"
echo " The agent will appear in the"
echo " Obliview admin panel once it"
echo " makes its first connection."
echo "=============================="
