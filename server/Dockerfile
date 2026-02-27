# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy root package.json for workspace resolution
COPY package.json ./

# Install & build shared package
COPY shared/ ./shared/
RUN cd shared && npm install && npm run build

# Install server dependencies (with workspace link to shared)
COPY server/package.json ./server/
RUN cd server && npm install

# Build server
COPY server/tsconfig.json server/knexfile.ts ./server/
COPY server/src/ ./server/src/
RUN cd server && npm run build

# ---- Production stage ----
FROM node:24-alpine AS production
WORKDIR /app

# Install OpenSSH client for Script monitors that use SSH
RUN apk add --no-cache openssh-client

# Shared: only compiled output needed
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/shared/dist/ ./shared/dist/

# Server: install prod deps only, then copy compiled output
COPY --from=builder /app/server/package.json ./server/
COPY package.json ./
RUN cd server && npm install --omit=dev

COPY --from=builder /app/server/dist/ ./server/dist/

# Agent files (served for download/installer endpoints)
COPY agent/package.json ./agent/
COPY agent/src/index.js ./agent/src/
COPY agent/installer/ ./agent/installer/

# Pre-built Windows MSI — build on Windows with: cd agent && build-msi.bat
# Requires: dotnet tool install --global wix, then npm install -g pkg
# Place agent/dist/obliview-agent.msi before running docker compose build.
COPY agent/dist/ ./agent/dist/

# Entrypoint: symlinks /root/.ssh → /custom/.ssh if it exists,
# so SSH keys and known_hosts persist across container recreates.
COPY server/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# dotenv is not needed in production (env vars come from Docker),
# but env.ts is compiled and will no-op if .env is missing

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

WORKDIR /app/server
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
