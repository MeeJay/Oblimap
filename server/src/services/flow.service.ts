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
    const rows = await db('network_flows')
      .where({ site_id: siteId, tenant_id: tenantId })
      .andWhereRaw(`last_seen_at >= NOW() - INTERVAL '${interval}'`)
      .orderBy('connection_count', 'desc');
    return rows.map(rowToFlow);
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
};
