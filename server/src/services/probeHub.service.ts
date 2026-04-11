/**
 * ProbeHub — manages raw WebSocket connections from probes.
 *
 * Architecture mirrors Obliance's agentHub.service.ts:
 * - Dedicated endpoint /api/probe/ws (NOT Socket.io)
 * - Auth via X-API-Key + X-Probe-UUID headers
 * - Simple JSON messages over RFC 6455 text frames
 * - Server-initiated ping every 15s (RFC 6455 ping/pong)
 */

import type WebSocket from 'ws';
import { db } from '../db';
import { logger } from '../utils/logger';
import { PROBE_WS_EVENTS } from '@oblimap/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProbeConn {
  ws: WebSocket;
  probeId: number;
  tenantId: number;
  probeUuid: string;
  apiKeyId: number;
}

interface ProbeWsMessage {
  type: string;
  [key: string]: unknown;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const byProbeId = new Map<number, ProbeConn>();

// Tunnel ready/error callbacks (tunnelId → resolver)
const tunnelCallbacks = new Map<string, {
  resolve: (result: { error?: string }) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

/** Tunnel data WebSocket connections (tunnelId → WebSocket from probe) */
const tunnelDataWs = new Map<string, WebSocket>();

export function getTunnelDataWs(tunnelId: string): WebSocket | undefined {
  return tunnelDataWs.get(tunnelId);
}

export function registerTunnelDataWs(tunnelId: string, ws: WebSocket): void {
  tunnelDataWs.set(tunnelId, ws);
  ws.on('close', () => tunnelDataWs.delete(tunnelId));
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function isProbeConnected(probeId: number): boolean {
  const conn = byProbeId.get(probeId);
  return conn != null && conn.ws.readyState === 1; // WebSocket.OPEN
}

export function getConnectedProbes(): Map<number, ProbeConn> {
  return byProbeId;
}

export function sendToProbe(probeId: number, msg: ProbeWsMessage): boolean {
  const conn = byProbeId.get(probeId);
  if (!conn || conn.ws.readyState !== 1) return false;
  try {
    conn.ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

/** Register a tunnel ready/error callback. Returns a promise that resolves when probe responds. */
export function waitForTunnelResponse(tunnelId: string, timeoutMs = 15_000): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      tunnelCallbacks.delete(tunnelId);
      resolve({ error: 'Tunnel open timed out (probe did not respond)' });
    }, timeoutMs);
    tunnelCallbacks.set(tunnelId, { resolve, timeout });
  });
}

// ─── Connection Handler ─────────────────────────────────────────────────────

export async function registerProbeWs(
  ws: WebSocket,
  probeId: number,
  tenantId: number,
  probeUuid: string,
  apiKeyId: number,
): Promise<void> {
  // Close any existing connection for this probe
  const existing = byProbeId.get(probeId);
  if (existing) {
    try { existing.ws.close(4000, 'Replaced by new connection'); } catch { /* ignore */ }
  }

  const conn: ProbeConn = { ws, probeId, tenantId, probeUuid, apiKeyId };
  byProbeId.set(probeId, conn);

  // Update last_seen_at
  await db('probes')
    .where({ id: probeId })
    .update({ last_seen_at: new Date() })
    .catch((err: unknown) => logger.error(err, 'Failed to update probe last_seen_at'));

  logger.info({ probeId, probeUuid, tenantId }, 'Probe WS connected (raw)');

  // ── Message handler ──
  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString()) as ProbeWsMessage;
      await handleProbeMessage(conn, msg);
    } catch (err) {
      logger.warn({ err, probeId }, 'Failed to parse probe WS message');
    }
  });

  // ── Disconnect ──
  ws.on('close', () => {
    if (byProbeId.get(probeId)?.ws === ws) {
      byProbeId.delete(probeId);
    }
    logger.info({ probeId, probeUuid }, 'Probe WS disconnected');
  });

  ws.on('error', (err) => {
    logger.warn({ err, probeId }, 'Probe WS error');
  });
}

// ─── Message Dispatch ───────────────────────────────────────────────────────

async function handleProbeMessage(conn: ProbeConn, msg: ProbeWsMessage): Promise<void> {
  switch (msg.type) {
    case 'scan_result': {
      // Lazy import to avoid circular dependency at startup
      const { probeService } = await import('./probe.service');
      const result = await probeService.handlePush(
        '', // apiKey not needed — already authenticated
        conn.probeUuid,
        msg.payload as any,
        conn.apiKeyId, // pass pre-validated key ID
      );
      const { httpStatus, ...body } = result;

      // Send config back
      sendToProbe(conn.probeId, { type: 'config_update', ...body });
      break;
    }

    case 'heartbeat': {
      await db('probes')
        .where({ id: conn.probeId })
        .update({ last_seen_at: new Date() })
        .catch(() => {});
      // Reply with ack
      sendToProbe(conn.probeId, { type: 'heartbeat_ack' });
      break;
    }

    case 'tunnel_ready': {
      const tunnelId = msg.tunnelId as string;
      const cb = tunnelCallbacks.get(tunnelId);
      if (cb) {
        clearTimeout(cb.timeout);
        tunnelCallbacks.delete(tunnelId);
        cb.resolve({});
      }
      break;
    }

    case 'tunnel_error': {
      const tunnelId = msg.tunnelId as string;
      const errMsg = (msg.error as string) ?? 'Unknown error';
      const cb = tunnelCallbacks.get(tunnelId);
      if (cb) {
        clearTimeout(cb.timeout);
        tunnelCallbacks.delete(tunnelId);
        cb.resolve({ error: errMsg });
      }
      break;
    }

    default:
      logger.debug({ type: msg.type, probeId: conn.probeId }, 'Unknown probe WS message');
  }
}

// ─── Ping keepalive (every 15s, like Obliance) ──────────────────────────────

setInterval(() => {
  for (const [, conn] of byProbeId) {
    if (conn.ws.readyState === 1) {
      try { conn.ws.ping(); } catch { /* ignore */ }
    }
  }
}, 15_000);
