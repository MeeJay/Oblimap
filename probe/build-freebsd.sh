#!/usr/bin/env bash
# =============================================================================
# Oblimap Probe — FreeBSD / OPNsense build (CGO_ENABLED=0)
#
# Pure Go cross-compilation — can be run from any platform.
#
# Usage (run from the probe/ directory, or anywhere — it self-locates):
#   bash probe/build-freebsd.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Version ───────────────────────────────────────────────────────────────────

VERSION=""
if [ -f "VERSION" ]; then
  VERSION="$(tr -d '[:space:]' < VERSION)"
fi
if [ -z "$VERSION" ] || [ "$VERSION" = "dev" ]; then
  echo "WARNING: Could not read a release version from probe/VERSION, using 'dev'."
  VERSION="dev"
fi

OUT_DIR="dist"
mkdir -p "$OUT_DIR"

# ── Build amd64 ──────────────────────────────────────────────────────────────

echo "Building Oblimap Probe $VERSION for freebsd/amd64..."
CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 \
  go build \
    -ldflags="-s -w -X main.ProbeVersion=$VERSION" \
    -o "$OUT_DIR/oblimap-probe-freebsd-amd64" \
    .
echo "  → $OUT_DIR/oblimap-probe-freebsd-amd64"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Built binaries:"
ls -lh "$OUT_DIR"/oblimap-probe-freebsd-* 2>/dev/null || true
