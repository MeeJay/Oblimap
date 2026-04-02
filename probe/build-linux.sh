#!/usr/bin/env bash
set -euo pipefail

# Build Oblimap Probe for Linux + FreeBSD.
# Runs on a Linux host — called remotely via SSH from 000-RegularUpdate.bat.

cd "$(dirname "$0")"
VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")

echo "Building Oblimap Probe v${VERSION} for Linux + FreeBSD..."

export CGO_ENABLED=0
mkdir -p dist

echo "  [1/3] linux/amd64..."
GOOS=linux GOARCH=amd64 go build \
  -ldflags="-s -w -X main.ProbeVersion=${VERSION}" \
  -o dist/oblimap-probe-linux-amd64 .

echo "  [2/3] linux/arm64..."
GOOS=linux GOARCH=arm64 go build \
  -ldflags="-s -w -X main.ProbeVersion=${VERSION}" \
  -o dist/oblimap-probe-linux-arm64 .

echo "  [3/3] freebsd/amd64..."
GOOS=freebsd GOARCH=amd64 go build \
  -ldflags="-s -w -X main.ProbeVersion=${VERSION}" \
  -o dist/oblimap-probe-freebsd-amd64 .

echo "Done. Binaries:"
ls -lh dist/oblimap-probe-linux-* dist/oblimap-probe-freebsd-*
