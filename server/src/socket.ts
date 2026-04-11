import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { authService } from './services/auth.service';
import { db } from './db';
import { PROBE_WS_EVENTS } from '@oblimap/shared';

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      // Accept the configured CLIENT_ORIGIN, or dynamically allow the same
      // origin as the request (covers same-site deployments where the app
      // connects to its own domain, e.g. inside ObliTools iframes).
      origin: (origin, callback) => {
        if (!origin) {
          // No origin header (server-to-server or same-origin polling)
          callback(null, true);
          return;
        }
        if (origin === config.clientOrigin) {
          callback(null, true);
          return;
        }
        // Allow same-hostname connections regardless of protocol/port mismatch
        try {
          const reqHost  = new URL(origin).hostname;
          const cfgHost  = new URL(config.clientOrigin).hostname;
          if (reqHost === cfgHost) {
            callback(null, true);
            return;
          }
        } catch { /* ignore parse errors */ }
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Socket.io authentication middleware
  io.use(async (socket, next) => {
    try {
      // The session userId and currentTenantId are passed via auth handshake
      const userId = socket.handshake.auth?.userId as number | undefined;
      const tenantId = socket.handshake.auth?.tenantId as number | undefined;

      if (!userId) {
        return next(new Error('Authentication required'));
      }

      const user = await authService.getUserById(userId);
      if (!user || !user.isActive) {
        return next(new Error('Invalid user'));
      }

      socket.data.user = user;
      socket.data.tenantId = tenantId ?? 1;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const tenantId: number = socket.data.tenantId;
    logger.info(`Socket connected: ${user.username} (id: ${user.id}, tenant: ${tenantId})`);

    // Join user-specific room
    socket.join(`user:${user.id}`);

    // Join tenant-scoped rooms
    socket.join(`tenant:${tenantId}`);
    if (user.role === 'admin') {
      socket.join(`tenant:${tenantId}:admin`);
      // Keep legacy role:admin room so existing emits continue to work
      // during gradual migration of all service emits to tenant rooms.
      socket.join('role:admin');
    }

    // Join notification rooms for ALL tenants this user can access.
    // This ensures cross-tenant live alerts are delivered in real-time,
    // even when the user is currently viewing a different tenant.
    db('user_tenants')
      .where('user_id', user.id)
      .pluck('tenant_id')
      .then((tenantIds: number[]) => {
        for (const tid of tenantIds) {
          socket.join(`tenant:${tid}:notifications`);
        }
      })
      .catch((err: unknown) => logger.error(err, 'Failed to join notification rooms'));

    // All authenticated users join the general room
    socket.join('general');

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${user.username}`);
    });
  });

  // ── /probe namespace for persistent probe WebSocket connections ─────────
  setupProbeNamespace(io);

  return io;
}

// ─── Probe WebSocket Registry ────────────────────────────────────────────────

/** probeId → Socket (one entry per connected probe) */
const connectedProbes = new Map<number, Socket>();

export function getConnectedProbes(): Map<number, Socket> {
  return connectedProbes;
}

export function isProbeConnected(probeId: number): boolean {
  return connectedProbes.has(probeId);
}

export function sendToProbe(probeId: number, event: string, payload: unknown): boolean {
  const socket = connectedProbes.get(probeId);
  if (!socket) return false;
  socket.emit(event, payload);
  return true;
}

// ─── /probe namespace ────────────────────────────────────────────────────────

function setupProbeNamespace(io: SocketIOServer): void {
  const probeNsp = io.of('/probe');

  // Auth middleware — API key + probe UUID
  probeNsp.use(async (socket, next) => {
    try {
      const apiKeyValue = socket.handshake.auth?.apiKey as string | undefined;
      const probeUuid = socket.handshake.auth?.probeUuid as string | undefined;

      if (!apiKeyValue || !probeUuid) {
        return next(new Error('Missing apiKey or probeUuid'));
      }

      // Lookup API key
      const apiKey = await db('probe_api_keys').where({ key: apiKeyValue }).first();
      if (!apiKey) {
        return next(new Error('Invalid API key'));
      }

      const tenantId = apiKey.tenant_id as number;

      // Find or register probe
      let probe = await db('probes')
        .where({ uuid: probeUuid, tenant_id: tenantId })
        .first();

      if (!probe) {
        // Probe will be fully registered on first scan_result — just reject for now
        // (the HTTP push handles initial registration)
        return next(new Error('Probe not registered — use HTTP push first'));
      }

      socket.data.tenantId = tenantId;
      socket.data.probeId = probe.id as number;
      socket.data.probeUuid = probeUuid;
      socket.data.apiKeyId = apiKey.id as number;

      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  probeNsp.on('connection', (socket) => {
    const probeId = socket.data.probeId as number;
    const tenantId = socket.data.tenantId as number;
    const probeUuid = socket.data.probeUuid as string;

    // Register in connected probes map
    connectedProbes.set(probeId, socket);
    socket.join(`probe:${probeId}`);

    logger.info({ probeId, probeUuid, tenantId }, 'Probe WS connected');

    // Update last_seen_at
    db('probes')
      .where({ id: probeId })
      .update({ last_seen_at: new Date() })
      .catch((err: unknown) => logger.error(err, 'Failed to update probe last_seen_at'));

    // ── Handle scan results ──
    socket.on(PROBE_WS_EVENTS.SCAN_RESULT, async (payload: unknown, ack?: (resp: unknown) => void) => {
      try {
        // Lazy import to avoid circular dependency
        const { probeService } = await import('./services/probe.service');
        const result = await probeService.handlePush(
          socket.handshake.auth.apiKey as string,
          probeUuid,
          payload as any,
        );
        const { httpStatus, ...body } = result;

        // Send config update back to probe
        socket.emit(PROBE_WS_EVENTS.CONFIG_UPDATE, body);

        // Ack if the client sent a callback
        if (typeof ack === 'function') ack(body);
      } catch (err) {
        logger.error({ err, probeId }, 'Probe WS scan_result error');
      }
    });

    // ── Handle heartbeat ──
    socket.on(PROBE_WS_EVENTS.HEARTBEAT, async () => {
      socket.emit(PROBE_WS_EVENTS.HEARTBEAT_ACK);
      db('probes')
        .where({ id: probeId })
        .update({ last_seen_at: new Date() })
        .catch((err: unknown) => logger.error(err, 'Heartbeat update failed'));
    });

    // ── Handle tunnel ready/error (forwarded to tunnel service) ──
    socket.on(PROBE_WS_EVENTS.TUNNEL_READY, (payload: unknown) => {
      socket.emit('_tunnel_ready', payload); // internal — tunnel service listens
    });
    socket.on(PROBE_WS_EVENTS.TUNNEL_ERROR, (payload: unknown) => {
      socket.emit('_tunnel_error', payload); // internal — tunnel service listens
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      connectedProbes.delete(probeId);
      logger.info({ probeId, probeUuid }, 'Probe WS disconnected');
    });
  });
}
