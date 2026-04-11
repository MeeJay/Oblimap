import { randomUUID } from 'crypto';
import { db } from '../db';
import { logger } from '../utils/logger';
import { PROBE_WS_EVENTS } from '@oblimap/shared';
import type { Tunnel, TunnelStatus } from '@oblimap/shared';
import { isProbeConnected, sendToProbe, getConnectedProbes } from '../socket';

// ─── Constants ──────────────────────────────────────────────────────────────

const TUNNEL_OPEN_TIMEOUT_MS = 15_000;
const TUNNEL_INACTIVITY_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_TUNNELS_PER_USER = 5;
const MAX_TUNNELS_PER_TENANT = 20;

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
      throw new Error(`Maximum ${MAX_TUNNELS_PER_USER} concurrent tunnels per user`);
    }

    const tenantCount = await db('tunnels')
      .where({ tenant_id: tenantId })
      .whereIn('status', ['opening', 'active'])
      .count('* as cnt')
      .first();
    if ((tenantCount?.cnt as number) >= MAX_TUNNELS_PER_TENANT) {
      throw new Error(`Maximum ${MAX_TUNNELS_PER_TENANT} concurrent tunnels per tenant`);
    }

    // Auto-select probe if not specified
    if (!probeId) {
      probeId = await this.selectProbe(tenantId, siteId, targetIp);
    }

    if (!probeId) {
      throw new Error('No available probe for this site');
    }

    if (!isProbeConnected(probeId)) {
      throw new Error('Selected probe is not connected via WebSocket (tunnels require WS)');
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
    sendToProbe(probeId, PROBE_WS_EVENTS.TUNNEL_OPEN, {
      tunnelId,
      targetIp,
      targetPort,
    });

    // Wait for probe:tunnel_ready or probe:tunnel_error
    const result = await this.waitForTunnelReady(probeId, tunnelId);

    if (result.error) {
      await db('tunnels').where({ id: tunnelId }).update({
        status: 'error',
        error_message: result.error,
        closed_at: new Date(),
      });
      throw new Error(`Tunnel failed: ${result.error}`);
    }

    // Mark as active
    await db('tunnels').where({ id: tunnelId }).update({ status: 'active' });

    const row = await db('tunnels').where({ id: tunnelId }).first();
    return rowToTunnel(row!);
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

  /** Wait for probe tunnel_ready or tunnel_error response */
  waitForTunnelReady(probeId: number, tunnelId: string): Promise<{ error?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ error: 'Tunnel open timed out (probe did not respond)' });
      }, TUNNEL_OPEN_TIMEOUT_MS);

      const socket = getConnectedProbes().get(probeId);
      if (!socket) {
        clearTimeout(timeout);
        resolve({ error: 'Probe disconnected' });
        return;
      }

      const onReady = (payload: { tunnelId: string }) => {
        if (payload.tunnelId !== tunnelId) return;
        clearTimeout(timeout);
        socket.off('_tunnel_ready', onReady);
        socket.off('_tunnel_error', onError);
        resolve({});
      };

      const onError = (payload: { tunnelId: string; error: string }) => {
        if (payload.tunnelId !== tunnelId) return;
        clearTimeout(timeout);
        socket.off('_tunnel_ready', onReady);
        socket.off('_tunnel_error', onError);
        resolve({ error: payload.error });
      };

      socket.on('_tunnel_ready', onReady);
      socket.on('_tunnel_error', onError);
    });
  },

  async closeTunnel(tunnelId: string, tenantId?: number): Promise<void> {
    const tunnel = await db('tunnels').where({ id: tunnelId }).first();
    if (!tunnel) return;
    if (tenantId && tunnel.tenant_id !== tenantId) return;

    // Send close command to probe
    if (isProbeConnected(tunnel.probe_id as number)) {
      sendToProbe(tunnel.probe_id as number, PROBE_WS_EVENTS.TUNNEL_CLOSE, {
        tunnelId,
      });
    }

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
