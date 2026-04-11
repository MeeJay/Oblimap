import './env';
import http from 'http';
import { URL } from 'url';
import { WebSocketServer } from 'ws';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { db } from './db';
import { config } from './config';
import { logger } from './utils/logger';
import { authService } from './services/auth.service';
import { setProbeServiceIO, probeService, cleanupDedupCache } from './services/probe.service';
import { tunnelService } from './services/tunnel.service';
import { setLiveAlertIO } from './services/liveAlert.service';
import { obligateService } from './services/obligate.service';
import { registerProbeWs } from './services/probeHub.service';

async function main() {
  // 1. Run pending migrations
  logger.info('Running database migrations...');
  await db.migrate.latest();
  logger.info('Migrations complete');

  // 2. Ensure default admin user exists
  await authService.ensureDefaultAdmin(
    config.defaultAdminUsername,
    config.defaultAdminPassword,
  );

  // 3. Create Express app
  const app = createApp();

  // 4. Create HTTP server
  const server = http.createServer(app);

  // 5. Attach Socket.io
  const io = createSocketServer(server);

  // Store io instance for later use
  app.set('io', io);

  // Provide io to probe service for real-time push events
  setProbeServiceIO(io);
  // Provide io to live alert service for real-time notification delivery
  setLiveAlertIO(io);

  // 6. Raw WebSocket for probes (/api/probe/ws) — like Obliance's agent WS
  const probeWss = new WebSocketServer({ noServer: true });
  const PROBE_WS_PATH = /^\/api\/probe\/ws\/?$/;
  const TUNNEL_WS_PATH = /^\/api\/probe\/ws\/tunnel\/([a-f0-9-]+)\/?$/;

  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url ?? '', `http://${request.headers.host}`).pathname;

    // Only handle /api/probe/ws* — let Socket.io handle /socket.io/
    if (!PROBE_WS_PATH.test(pathname) && !TUNNEL_WS_PATH.test(pathname)) return;

    const apiKeyValue = request.headers['x-api-key'] as string | undefined;
    const probeUuid = request.headers['x-probe-uuid'] as string | undefined;

    if (!apiKeyValue || !probeUuid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Validate API key
    const apiKey = await db('probe_api_keys').where({ key: apiKeyValue }).first();
    if (!apiKey) {
      socket.write('HTTP/1.1 401 Invalid API key\r\n\r\n');
      socket.destroy();
      return;
    }

    const tenantId = apiKey.tenant_id as number;

    // Find probe
    const probe = await db('probes')
      .where({ uuid: probeUuid, tenant_id: tenantId })
      .first();

    if (!probe) {
      socket.write('HTTP/1.1 404 Probe not registered\r\n\r\n');
      socket.destroy();
      return;
    }

    // Upgrade to WebSocket
    const tunnelMatch = pathname.match(TUNNEL_WS_PATH);
    probeWss.handleUpgrade(request, socket, head, (ws) => {
      if (tunnelMatch) {
        // Tunnel data channel — just emit as a raw WS for the tunnel service to pair
        ws.emit('tunnel_ws', tunnelMatch[1], ws);
      } else {
        // Control channel
        registerProbeWs(ws, probe.id as number, tenantId, probeUuid, apiKey.id as number);
      }
    });
  });

  // 7. Listen
  server.listen(config.port, () => {
    logger.info(`Oblimap server listening on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);

    // Sync capability schemas with Obligate (non-blocking)
    obligateService.syncCapabilitySchemas().catch(() => {});
  });

  // 7. Probe cleanup job — auto-delete probes whose uninstall command was delivered
  //    more than 10 minutes ago
  const PROBE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const probeCleanupTimer = setInterval(async () => {
    try {
      await probeService.cleanupUninstalledProbes();
      await probeService.cleanupStuckUpdating();
      cleanupDedupCache();
      await tunnelService.cleanupStaleTunnels();
    } catch (err) {
      logger.error(err, 'Probe cleanup job failed');
    }
  }, PROBE_CLEANUP_INTERVAL_MS);

  // 8. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(probeCleanupTimer);
    server.close();
    await db.destroy();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start Oblimap server');
  process.exit(1);
});
