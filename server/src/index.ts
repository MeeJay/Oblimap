import './env';
import http from 'http';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { db } from './db';
import { config } from './config';
import { logger } from './utils/logger';
import { authService } from './services/auth.service';
import { setProbeServiceIO, probeService } from './services/probe.service';
import { setLiveAlertIO } from './services/liveAlert.service';

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

  // 6. Listen
  server.listen(config.port, () => {
    logger.info(`Oblimap server listening on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });

  // 7. Probe cleanup job — auto-delete probes whose uninstall command was delivered
  //    more than 10 minutes ago
  const PROBE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const probeCleanupTimer = setInterval(async () => {
    try {
      await probeService.cleanupUninstalledProbes();
      await probeService.cleanupStuckUpdating();
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
