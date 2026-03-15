#!/usr/bin/env bash
# =============================================================================
# Oblimap Probe — Native macOS build (CGO_ENABLED=0)
#
# The probe does not use any CGO-dependent libraries (no gopsutil, no Mach API).
# Pure Go — both architectures can be built natively or cross-compiled.
#
# This script must be run ON a Mac (Apple Silicon or Intel). It builds BOTH
# architectures via cross-compilation (no clang needed).
#
# Usage (run from the probe/ directory, or anywhere — it self-locates):
#   bash probe/build-mac.sh
#   # or from inside probe/:
#   bash build-mac.sh
#
# After running, the .bat script retrieves both binaries via SCP to:
#   probe/dist/oblimap-probe-darwin-arm64
#   probe/dist/oblimap-probe-darwin-amd64
# Then the Docker build picks them up via COPY probe/dist/.
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

# ── Build arm64 ───────────────────────────────────────────────────────────────

echo "Building Oblimap Probe $VERSION for darwin/arm64..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
  go build \
    -ldflags="-s -w -X main.ProbeVersion=$VERSION" \
    -o "$OUT_DIR/oblimap-probe-darwin-arm64" \
    .
echo "  → $OUT_DIR/oblimap-probe-darwin-arm64"

# ── Build amd64 ───────────────────────────────────────────────────────────────

echo ""
echo "Building Oblimap Probe $VERSION for darwin/amd64..."
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 \
  go build \
    -ldflags="-s -w -X main.ProbeVersion=$VERSION" \
    -o "$OUT_DIR/oblimap-probe-darwin-amd64" \
    .
echo "  → $OUT_DIR/oblimap-probe-darwin-amd64"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Built binaries:"
ls -lh "$OUT_DIR"/oblimap-probe-darwin-* 2>/dev/null || true
echo ""
echo "Next steps:"
echo "  The 000-RegularUpdate.bat script retrieves both binaries automatically via SCP."
echo "  Run 000-RegularUpdate.bat to rebuild the Docker image — the Dockerfile's"
echo "  COPY probe/dist/ picks up both darwin binaries."
