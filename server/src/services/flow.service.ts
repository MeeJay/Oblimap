import { db } from '../db';
import type { NetworkFlow, FlowEntry, FlowPeriod } from '@oblimap/shared';

function rowToFlow(row: Record<string, unknown>): NetworkFlow {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    tenantId: row.tenant_id as number,
    sourceIp: row.source_ip as string,
    sourcePort: row.source_port as number | null,
    destIp: row.dest_ip as string,
    destPort: row.dest_port as number,
    protocol: row.protocol as string,
    sourceProcess: row.source_process as string | null,
    connectionCount: row.connection_count as number,
    discoveredByProbeId: row.discovered_by_probe_id as number | null,
    firstSeenAt: (row.first_seen_at as Date).toISOString(),
    lastSeenAt: (row.last_seen_at as Date).toISOString(),
  };
}

function periodToInterval(period: FlowPeriod): string {
  switch (period) {
    case '1h': return '1 hour';
    case '24h': return '24 hours';
    case '30d': return '30 days';
    case '1y': return '365 days';
  }
}

export const flowService = {
  async getFlows(tenantId: number, siteId: number, period: FlowPeriod): Promise<NetworkFlow[]> {
    const interval = periodToInterval(period);

    // Get all known IPs in this site for filtering
    const siteIps = await db('site_items')
      .where({ site_id: siteId, tenant_id: tenantId })
      .pluck('ip') as string[];
    const ipSet = new Set(siteIps);

    const rows = await db('network_flows')
      .where({ site_id: siteId, tenant_id: tenantId })
      .andWhereRaw(`last_seen_at >= NOW() - INTERVAL '${interval}'`)
      .orderBy('connection_count', 'desc');

    // Only include flows where at least one endpoint is a known device
    return rows.map(rowToFlow).filter(f => ipSet.has(f.sourceIp) || ipSet.has(f.destIp));
  },

  async processFlows(
    tenantId: number,
    siteId: number,
    probeId: number,
    flows: FlowEntry[],
  ): Promise<void> {
    const now = new Date();
    for (const flow of flows) {
      const existing = await db('network_flows')
        .where({
          site_id: siteId,
          tenant_id: tenantId,
          source_ip: flow.sourceIp,
          dest_ip: flow.destIp,
          dest_port: flow.destPort,
          protocol: flow.protocol || 'tcp',
        })
        .first();

      if (existing) {
        await db('network_flows')
          .where({ id: existing.id })
          .update({
            last_seen_at: now,
            connection_count: db.raw('connection_count + 1'),
            source_process: flow.process || existing.source_process,
            discovered_by_probe_id: probeId,
          });
      } else {
        await db('network_flows').insert({
          site_id: siteId,
          tenant_id: tenantId,
          source_ip: flow.sourceIp,
          source_port: flow.sourcePort || null,
          dest_ip: flow.destIp,
          dest_port: flow.destPort,
          protocol: flow.protocol || 'tcp',
          source_process: flow.process || null,
          connection_count: 1,
          discovered_by_probe_id: probeId,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }
  },

  async clearFlows(tenantId: number, siteId: number): Promise<number> {
    return db('network_flows')
      .where({ site_id: siteId, tenant_id: tenantId })
      .delete();
  },

  /**
   * Delete flows where source_ip or dest_ip starts with the given /24 prefix.
   * @param prefix e.g. "192.168.1" — matches all IPs 192.168.1.*
   */
  async clearFlowsForSubnet(tenantId: number, siteId: number, prefix: string): Promise<number> {
    return db('network_flows')
      .where({ site_id: siteId, tenant_id: tenantId })
      .andWhere(function () {
        this.where('source_ip', 'like', `${prefix}.%`)
          .orWhere('dest_ip', 'like', `${prefix}.%`);
      })
      .delete();
  },
};
