# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

# Root package.json for workspace resolution
COPY package.json ./

# Shared source (needed by Vite alias @obliview/shared → ../shared/src)
# Also needs its own package.json for workspace linking
COPY shared/ ./shared/

# Install client dependencies via workspace
COPY client/package.json ./client/
RUN npm install --workspace=client

# Build client (copy remaining source)
COPY client/ ./client/
RUN cd client && npm run build

# ---- Production stage ----
FROM nginx:alpine AS production

COPY --from=builder /app/client/dist/ /usr/share/nginx/html/
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Verify that nginx is alive and serving responses.
# wget is available in nginx:alpine. Checks the root path every 30s;
# if nginx crashes or hangs, the container is marked unhealthy and
# Docker (or Compose) will restart it automatically.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
