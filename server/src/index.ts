import './env';
import http from 'http';
import { createApp } from './app';
import { createSocketServer } from './socket';
import { db } from './db';
import { config } from './config';
import { logger } from './utils/logger';
import { authService } from './services/auth.service';
import { MonitorWorkerManager } from './workers/MonitorWorkerManager';
import { heartbeatService } from './services/heartbeat.service';
import { setAgentServiceIO } from './services/agent.service';

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

  // Provide io to agent service for real-time push events
  setAgentServiceIO(io);

  // 6. Start monitor workers
  const workerManager = MonitorWorkerManager.getInstance(io);
  await workerManager.startAll();

  // 7. Listen
  server.listen(config.port, () => {
    logger.info(`Obliview server listening on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Active monitors: ${workerManager.getRunningCount()}`);
  });

  // 8. Heartbeat retention job — purge heartbeats older than 90 days every 6 hours
  const RETENTION_DAYS = 90;
  const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const retentionTimer = setInterval(async () => {
    try {
      const deleted = await heartbeatService.purgeOlderThan(RETENTION_DAYS);
      if (deleted > 0) {
        logger.info(`Retention: purged ${deleted} heartbeats older than ${RETENTION_DAYS} days`);
      }
    } catch (err) {
      logger.error(err, 'Retention job failed');
    }
  }, RETENTION_INTERVAL_MS);

  // 9. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(retentionTimer);
    await workerManager.stopAll();
    server.close();
    await db.destroy();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
