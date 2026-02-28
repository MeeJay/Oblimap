#!/usr/bin/env bash
# =============================================================================
# Obliview Agent — Native macOS build (CGO_ENABLED=1)
#
# Why native? gopsutil's cpu.Percent(percpu=true) calls host_processor_info
# (Mach API) which requires CGO. Cross-compiled binaries skip this and fall
# back to `top`, which only gives overall CPU % — no per-core bars in the UI.
#
# This script must be run ON a Mac (Apple Silicon or Intel). The resulting
# binary is placed in dist/ and will override the cross-compiled darwin binary
# when the Docker image is built (server/Dockerfile's last COPY agent/dist/).
#
# Usage (run from the agent/ directory, or anywhere — it self-locates):
#   bash agent/build-mac.sh
#   # or from inside agent/:
#   bash build-mac.sh
#
# After running, copy the binary to the Windows/Unraid build host at:
#   agent/dist/obliview-agent-darwin-<arch>
# Then run 000-RegularUpdate.bat (or 00-A2-docker-agent-push.bat) to rebuild.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Architecture detection ────────────────────────────────────────────────────

GOARCH="$(go env GOARCH 2>/dev/null || uname -m | sed 's/x86_64/amd64/')"
case "$GOARCH" in
  arm64|amd64) ;;
  *)
    echo "ERROR: Unsupported Go architecture: $GOARCH" >&2
    echo "       Run this script on an Apple Silicon (arm64) or Intel (amd64) Mac." >&2
    exit 1
    ;;
esac

# ── Version ───────────────────────────────────────────────────────────────────

VERSION=""
if [ -f "VERSION" ]; then
  VERSION="$(tr -d '[:space:]' < VERSION)"
fi
if [ -z "$VERSION" ] || [ "$VERSION" = "dev" ]; then
  echo "WARNING: Could not read a release version from agent/VERSION, using 'dev'."
  echo "         Run 00-A0-bump-agent.bat first to set the version."
  VERSION="dev"
fi

# ── Build ─────────────────────────────────────────────────────────────────────

OUT_DIR="dist"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/obliview-agent-darwin-$GOARCH"

echo "Building Obliview Agent $VERSION for darwin/$GOARCH (CGO_ENABLED=1)..."
echo ""

CGO_ENABLED=1 GOOS=darwin GOARCH="$GOARCH" \
  go build \
    -ldflags="-s -w -X main.agentVersion=$VERSION" \
    -o "$OUT_FILE" \
    .

echo "Done: $SCRIPT_DIR/$OUT_FILE"
echo ""
echo "This binary enables:"
echo "  - Per-core CPU bars (via Mach host_processor_info, requires CGO)"
echo "  - All existing metrics unchanged"
echo ""
echo "Next steps:"
echo "  1. If building on a remote Mac: scp $OUT_FILE to the Unraid build host"
echo "     at the same relative path (agent/dist/obliview-agent-darwin-$GOARCH)"
echo "  2. Run 000-RegularUpdate.bat (or 00-A2-docker-agent-push.bat) to rebuild"
echo "     the Docker image — the Dockerfile's last 'COPY agent/dist/' picks up"
echo "     this binary and overrides the cross-compiled darwin/$GOARCH binary."
