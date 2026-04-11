import net from 'net';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { logger } from '../utils/logger';
import type { Tunnel, TunnelStatus } from '@oblimap/shared';
import { isProbeConnected, sendToProbe, getConnectedProbes, waitForTunnelResponse, getTunnelDataWs } from './probeHub.service';
import { AppError } from '../middleware/errorHandler';

// ─── Constants ──────────────────────────────────────────────────────────────

const TUNNEL_OPEN_TIMEOUT_MS = 15_000;
const TUNNEL_INACTIVITY_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_TUNNELS_PER_USER = 5;
const MAX_TUNNELS_PER_TENANT = 20;

// ─── Local TCP relay per tunnel ─────────────────────────────────────────────
// Each active tunnel gets a local TCP server on a random port.
// Browser requests to /api/tunnel/:id/proxy are forwarded to this local port,
// which relays through the probe's tunnel WS to the target device.

const localServers = new Map<string, { server: net.Server; port: number }>();

/** Get the local proxy port for a tunnel (used by the HTTP proxy route). */
export function getTunnelLocalPort(tunnelId: string): number | null {
  return localServers.get(tunnelId)?.port ?? null;
}

/** Start a local TCP relay for a tunnel. */
function startLocalRelay(tunnelId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer((clientSocket) => {
      const tunnelWs = getTunnelDataWs(tunnelId);
      if (!tunnelWs || tunnelWs.readyState !== 1) {
        clientSocket.destroy();
        return;
      }

      // Relay: local TCP client ↔ tunnel WS ↔ probe ↔ target
      clientSocket.on('data', (chunk) => {
        try { tunnelWs.send(chunk); } catch { clientSocket.destroy(); }
      });

      tunnelWs.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          clientSocket.write(buf);
        } catch { /* ignore */ }
      });

      clientSocket.on('close', () => {
        // Don't close the WS — other connections may reuse the tunnel
      });
      clientSocket.on('error', () => clientSocket.destroy());

      tunnelWs.on('close', () => clientSocket.destroy());
    });

    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      localServers.set(tunnelId, { server: srv, port: addr.port });
      logger.info({ tunnelId, localPort: addr.port }, 'Tunnel local TCP relay started');
      resolve(addr.port);
    });

    srv.on('error', reject);
  });
}

/** Stop a local TCP relay. */
function stopLocalRelay(tunnelId: string): void {
  const entry = localServers.get(tunnelId);
  if (entry) {
    entry.server.close();
    localServers.delete(tunnelId);
  }
}

// ─── Row Helper ─────────────────────────────────────────────────────────────

function rowToTunnel(row: Record<string, unknown>): Tunnel {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as number,
    probeId: row.probe_id as number,
    siteId: row.site_id as number,
    targetIp: row.target_ip as string,
    targetPort: row.target_port as number,
    status: row.status as TunnelStatus,
    requestedBy: (row.requested_by as number | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    closedAt: row.closed_at ? (row.closed_at as Date).toISOString() : null,
  };
}

// ─── Tunnel Service ─────────────────────────────────────────────────────────

export const tunnelService = {
  /**
   * Open a tunnel through a probe to a target device.
   * Auto-selects a probe if probeId is null.
   */
  async openTunnel(
    tenantId: number,
    userId: number,
    siteId: number,
    targetIp: string,
    targetPort: number,
    probeId?: number | null,
  ): Promise<Tunnel> {
    // Rate limits
    const userCount = await db('tunnels')
      .where({ requested_by: userId, tenant_id: tenantId })
      .whereIn('status', ['opening', 'active'])
      .count('* as cnt')
      .first();
    if ((userCount?.cnt as number) >= MAX_TUNNELS_PER_USER) {
      throw new AppError(429, `Maximum ${MAX_TUNNELS_PER_USER} concurrent tunnels per user`);
    }

    const tenantCount = await db('tunnels')
      .where({ tenant_id: tenantId })
      .whereIn('status', ['opening', 'active'])
      .count('* as cnt')
      .first();
    if ((tenantCount?.cnt as number) >= MAX_TUNNELS_PER_TENANT) {
      throw new AppError(429, `Maximum ${MAX_TUNNELS_PER_TENANT} concurrent tunnels per tenant`);
    }

    // Auto-select probe if not specified
    if (!probeId) {
      probeId = await this.selectProbe(tenantId, siteId, targetIp);
    }

    if (!probeId) {
      throw new AppError(400, 'No available probe for this site. Ensure at least one probe is approved and assigned.');
    }

    if (!isProbeConnected(probeId)) {
      throw new AppError(503, 'Selected probe is not connected via WebSocket. Tunnels require probes running v2.0+ with WS support. Rebuild and redeploy the probe binary.');
    }

    // Create tunnel record
    const tunnelId = randomUUID();
    await db('tunnels').insert({
      id: tunnelId,
      tenant_id: tenantId,
      probe_id: probeId,
      site_id: siteId,
      target_ip: targetIp,
      target_port: targetPort,
      status: 'opening',
      requested_by: userId,
    });

    // Send tunnel_open command to probe via WS
    sendToProbe(probeId, {
      type: 'tunnel_open',
      tunnelId,
      targetIp,
      targetPort,
    });

    // Wait for probe tunnel_ready or tunnel_error
    const result = await waitForTunnelResponse(tunnelId);

    if (result.error) {
      await db('tunnels').where({ id: tunnelId }).update({
        status: 'error',
        error_message: result.error,
        closed_at: new Date(),
      });
      throw new AppError(502, `Tunnel failed: ${result.error}`);
    }

    // Mark as active
    await db('tunnels').where({ id: tunnelId }).update({ status: 'active' });

    // Wait a moment for the probe's tunnel data WS to connect, then start local relay
    await new Promise((r) => setTimeout(r, 1000));
    let localPort: number | null = null;
    try {
      localPort = await startLocalRelay(tunnelId);
    } catch (err) {
      logger.error({ err, tunnelId }, 'Failed to start local TCP relay');
    }

    const row = await db('tunnels').where({ id: tunnelId }).first();
    const tunnel = rowToTunnel(row!);
    return { ...tunnel, localPort } as Tunnel & { localPort: number | null };
  },

  /**
   * Auto-select the best probe for a tunnel.
   * Priority: discoverer → primary → least loaded.
   */
  async selectProbe(tenantId: number, siteId: number, targetIp: string): Promise<number | null> {
    // 1. Prefer probe that discovered the device
    const item = await db('site_items')
      .where({ site_id: siteId, tenant_id: tenantId, ip: targetIp })
      .first('discovered_by_probe_id');

    if (item?.discovered_by_probe_id && isProbeConnected(item.discovered_by_probe_id as number)) {
      return item.discovered_by_probe_id as number;
    }

    // 2. Prefer primary probe
    const primary = await db('probes')
      .where({ site_id: siteId, tenant_id: tenantId, status: 'approved', is_primary: true })
      .first('id');

    if (primary && isProbeConnected(primary.id as number)) {
      return primary.id as number;
    }

    // 3. Pick least loaded WS-connected probe on this site
    const siteProbes = await db('probes')
      .where({ site_id: siteId, tenant_id: tenantId, status: 'approved' })
      .select('id');

    const connectedProbes = getConnectedProbes();
    const candidates = siteProbes
      .filter((p) => connectedProbes.has(p.id as number))
      .map((p) => p.id as number);

    if (candidates.length === 0) return null;

    // Count active tunnels per candidate
    const tunnelCounts = await db('tunnels')
      .whereIn('probe_id', candidates)
      .whereIn('status', ['opening', 'active'])
      .groupBy('probe_id')
      .select('probe_id')
      .count('* as cnt');

    const countMap = new Map(tunnelCounts.map((r) => [r.probe_id as number, Number(r.cnt)]));

    // Sort by least tunnels
    candidates.sort((a, b) => (countMap.get(a) ?? 0) - (countMap.get(b) ?? 0));
    return candidates[0];
  },

  async closeTunnel(tunnelId: string, tenantId?: number): Promise<void> {
    const tunnel = await db('tunnels').where({ id: tunnelId }).first();
    if (!tunnel) return;
    if (tenantId && tunnel.tenant_id !== tenantId) return;

    // Send close command to probe
    if (isProbeConnected(tunnel.probe_id as number)) {
      sendToProbe(tunnel.probe_id as number, {
        type: 'tunnel_close',
        tunnelId,
      });
    }

    stopLocalRelay(tunnelId);
    await db('tunnels').where({ id: tunnelId }).update({
      status: 'closed',
      closed_at: new Date(),
    });
  },

  async getTunnel(tunnelId: string, tenantId: number): Promise<Tunnel | null> {
    const row = await db('tunnels').where({ id: tunnelId, tenant_id: tenantId }).first();
    return row ? rowToTunnel(row) : null;
  },

  async listTunnels(tenantId: number): Promise<Tunnel[]> {
    const rows = await db('tunnels')
      .where({ tenant_id: tenantId })
      .whereIn('status', ['opening', 'active'])
      .orderBy('created_at', 'desc');
    return rows.map(rowToTunnel);
  },

  /** Cleanup stale tunnels (probe disconnected) */
  async cleanupStaleTunnels(): Promise<void> {
    const active = await db('tunnels')
      .whereIn('status', ['opening', 'active'])
      .select('id', 'probe_id');

    for (const tunnel of active) {
      if (!isProbeConnected(tunnel.probe_id as number)) {
        await db('tunnels').where({ id: tunnel.id }).update({
          status: 'closed',
          error_message: 'Probe disconnected',
          closed_at: new Date(),
        });
        logger.info({ tunnelId: tunnel.id }, 'Closed stale tunnel (probe disconnected)');
      }
    }

    // Also close tunnels inactive for > 30 min
    const cutoff = new Date(Date.now() - TUNNEL_INACTIVITY_TTL_MS);
    const expired = await db('tunnels')
      .whereIn('status', ['opening', 'active'])
      .where('created_at', '<', cutoff)
      .update({ status: 'closed', error_message: 'Inactivity timeout', closed_at: new Date() });

    if (expired > 0) {
      logger.info({ count: expired }, 'Closed expired tunnels');
    }
  },
};
