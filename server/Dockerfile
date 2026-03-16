# ---- Node.js build stage (server + shared) ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/ ./shared/
RUN cd shared && npm install && npm run build

COPY server/package.json ./server/
RUN cd server && npm install

COPY server/tsconfig.json server/knexfile.ts ./server/
COPY server/src/ ./server/src/
RUN cd server && npm run build

# ---- Go cross-compilation stage (all probe platform binaries) ----
FROM golang:1.22-alpine AS go-probe-builder
WORKDIR /build

# Download dependencies first (layer cache)
COPY probe/go.mod probe/go.sum* ./
RUN go mod download 2>/dev/null || true

COPY probe/ ./
RUN go mod tidy

# All platforms — version injected from VERSION file (single source of truth).
# probe/main.go uses `var ProbeVersion = "1.0.0"` overridden here via -X ldflags.
RUN VERSION=$(cat VERSION) && \
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
        go build -ldflags="-s -w -X main.ProbeVersion=${VERSION}" -o dist/oblimap-probe.exe . && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
        go build -ldflags="-s -w -X main.ProbeVersion=${VERSION}" -o dist/oblimap-probe-linux-amd64 . && \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
        go build -ldflags="-s -w -X main.ProbeVersion=${VERSION}" -o dist/oblimap-probe-linux-arm64 . && \
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 \
        go build -ldflags="-s -w -X main.ProbeVersion=${VERSION}" -o dist/oblimap-probe-darwin-amd64 . && \
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 \
        go build -ldflags="-s -w -X main.ProbeVersion=${VERSION}" -o dist/oblimap-probe-darwin-arm64 .

# ---- Production stage ----
FROM node:24-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssh-client

COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/shared/dist/ ./shared/dist/

COPY --from=builder /app/server/package.json ./server/
COPY package.json ./
RUN cd server && npm install --omit=dev

COPY --from=builder /app/server/dist/ ./server/dist/

# Probe installer scripts + VERSION file (used by GET /api/probe/version)
COPY probe/installer/ ./probe/installer/
COPY probe/VERSION ./probe/

# Probe binaries from Go cross-compilation
RUN mkdir -p ./probe/dist
COPY --from=go-probe-builder /build/dist/oblimap-probe.exe            ./probe/dist/
COPY --from=go-probe-builder /build/dist/oblimap-probe-linux-amd64   ./probe/dist/
COPY --from=go-probe-builder /build/dist/oblimap-probe-linux-arm64   ./probe/dist/
COPY --from=go-probe-builder /build/dist/oblimap-probe-darwin-amd64  ./probe/dist/
COPY --from=go-probe-builder /build/dist/oblimap-probe-darwin-arm64  ./probe/dist/

# Pre-built Windows MSI (build on Windows: cd probe && build-msi.bat)
# If absent, the /api/probe/installer/windows.msi endpoint returns 404.
COPY probe/dist/ ./probe/dist/

# Obli.tools VERSION file (read by GET /api/agent/desktop-version to drive the update banner).
# Must be present — without it the endpoint returns 0.0.0 and the banner never fires.
COPY obli.tools/VERSION ./obli.tools/

# Obli.tools release binaries (build on Windows: obli.tools/build-windows.ps1 → dist/ObliTools.exe)
#                              (build on macOS:   obli.tools/build-mac.sh      → dist/ObliTools-*.dmg/zip)
# If absent, the /downloads/:filename endpoint returns 404 (no hard failure).
RUN mkdir -p ./obli.tools/dist
COPY obli.tools/dist/ ./obli.tools/dist/

COPY server/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

WORKDIR /app/server
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
