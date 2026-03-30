import { db } from '../db';
import type { Site, SiteItem, IpReservation, DeviceType } from '@oblimap/shared';

// ─── Row helpers ──────────────────────────────────────────────────────────────

function rowToSite(row: Record<string, unknown>): Site {
  return {
    id: row.id as number,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    groupId: (row.group_id as number | null) ?? null,
    tenantId: row.tenant_id as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    itemCount: row.item_count != null ? Number(row.item_count) : undefined,
    onlineCount: row.online_count != null ? Number(row.online_count) : undefined,
    offlineCount: row.offline_count != null ? Number(row.offline_count) : undefined,
    probeCount: row.probe_count != null ? Number(row.probe_count) : undefined,
  };
}

function rowToItem(row: Record<string, unknown>): SiteItem {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    tenantId: row.tenant_id as number,
    ip: row.ip as string,
    mac: (row.mac as string | null) ?? null,
    hostname: (row.hostname as string | null) ?? null,
    customName: (row.custom_name as string | null) ?? null,
    deviceType: (row.device_type as DeviceType) ?? 'unknown',
    vendor: (row.vendor as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as SiteItem['status']) ?? 'unknown',
    isManual: Boolean(row.is_manual),
    discoveredByProbeId: (row.discovered_by_probe_id as number | null) ?? null,
    firstSeenAt: (row.first_seen_at as Date).toISOString(),
    lastSeenAt: (row.last_seen_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    openPorts: row.open_ports != null
      ? (typeof row.open_ports === 'string' ? JSON.parse(row.open_ports) : row.open_ports)
      : null,
  };
}

function rowToReservation(row: Record<string, unknown>): IpReservation {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    tenantId: row.tenant_id as number,
    ip: row.ip as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    deviceType: (row.device_type as DeviceType | null) ?? null,
    createdBy: (row.created_by as number | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    isOccupied: row.is_occupied != null ? Boolean(row.is_occupied) : undefined,
    occupiedByMac: (row.occupied_by_mac as string | null) ?? null,
  };
}

// ─── Site Service ─────────────────────────────────────────────────────────────

class SiteService {
  // ── Sites ─────────────────────────────────────────────────────────────────

  async getSites(tenantId: number, opts?: { groupId?: number; ungrouped?: boolean }): Promise<Site[]> {
    const rows = await db('sites as s')
      .where('s.tenant_id', tenantId)
      .modify((q) => {
        if (opts?.groupId !== undefined) q.where('s.group_id', opts.groupId);
        if (opts?.ungrouped) q.whereNull('s.group_id');
      })
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as item_count')
          .where('tenant_id', tenantId)
          .groupBy('site_id')
          .as('ic'),
        's.id', 'ic.site_id',
      )
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as online_count')
          .where({ tenant_id: tenantId, status: 'online' })
          .groupBy('site_id')
          .as('oc'),
        's.id', 'oc.site_id',
      )
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as offline_count')
          .where({ tenant_id: tenantId, status: 'offline' })
          .groupBy('site_id')
          .as('ofc'),
        's.id', 'ofc.site_id',
      )
      .leftJoin(
        db('probes')
          .select('site_id')
          .count('* as probe_count')
          .where({ tenant_id: tenantId, status: 'approved' })
          .whereNotNull('site_id')
          .groupBy('site_id')
          .as('pc'),
        's.id', 'pc.site_id',
      )
      .select(
        's.*',
        db.raw('COALESCE(ic.item_count, 0) as item_count'),
        db.raw('COALESCE(oc.online_count, 0) as online_count'),
        db.raw('COALESCE(ofc.offline_count, 0) as offline_count'),
        db.raw('COALESCE(pc.probe_count, 0) as probe_count'),
      )
      .orderBy('s.name', 'asc');

    return rows.map(rowToSite);
  }

  async getSite(tenantId: number, id: number): Promise<Site | null> {
    const rows = await db('sites as s')
      .where({ 's.id': id, 's.tenant_id': tenantId })
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as item_count')
          .where('tenant_id', tenantId)
          .groupBy('site_id')
          .as('ic'),
        's.id', 'ic.site_id',
      )
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as online_count')
          .where({ tenant_id: tenantId, status: 'online' })
          .groupBy('site_id')
          .as('oc'),
        's.id', 'oc.site_id',
      )
      .leftJoin(
        db('site_items')
          .select('site_id')
          .count('* as offline_count')
          .where({ tenant_id: tenantId, status: 'offline' })
          .groupBy('site_id')
          .as('ofc'),
        's.id', 'ofc.site_id',
      )
      .leftJoin(
        db('probes')
          .select('site_id')
          .count('* as probe_count')
          .where({ tenant_id: tenantId, status: 'approved' })
          .whereNotNull('site_id')
          .groupBy('site_id')
          .as('pc'),
        's.id', 'pc.site_id',
      )
      .select(
        's.*',
        db.raw('COALESCE(ic.item_count, 0) as item_count'),
        db.raw('COALESCE(oc.online_count, 0) as online_count'),
        db.raw('COALESCE(ofc.offline_count, 0) as offline_count'),
        db.raw('COALESCE(pc.probe_count, 0) as probe_count'),
      )
      .first();

    return rows ? rowToSite(rows) : null;
  }

  async createSite(
    tenantId: number,
    data: { name: string; description?: string | null; groupId?: number | null },
  ): Promise<Site> {
    const [row] = await db('sites')
      .insert({
        name: data.name,
        description: data.description ?? null,
        group_id: data.groupId ?? null,
        tenant_id: tenantId,
      })
      .returning('*');
    return rowToSite(row);
  }

  async updateSite(
    tenantId: number,
    id: number,
    data: Partial<{ name: string; description: string | null; groupId: number | null }>,
  ): Promise<Site | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.groupId !== undefined) patch.group_id = data.groupId;

    await db('sites').where({ id, tenant_id: tenantId }).update(patch);
    return this.getSite(tenantId, id);
  }

  async deleteSite(tenantId: number, id: number): Promise<void> {
    await db('sites').where({ id, tenant_id: tenantId }).delete();
  }

  // ── Site Items ────────────────────────────────────────────────────────────

  async getItems(tenantId: number, siteId: number): Promise<SiteItem[]> {
    // Cross-reference reservations to mark conflicts
    const items = await db('site_items')
      .where({ site_id: siteId, tenant_id: tenantId })
      // ip::inet casts to PostgreSQL's inet type for proper numeric sort (1,2,...,10,11,...,100)
      // instead of lexicographic (1,10,100,...,11,...)
      .orderByRaw("ip::inet ASC");

    const reservedIps = await db('ip_reservations')
      .where({ site_id: siteId, tenant_id: tenantId })
      .pluck('ip') as string[];

    const reservedSet = new Set(reservedIps);

    // Load probes assigned to this site so we can identify their own device entry
    const siteProbes = await db('probes')
      .where({ site_id: siteId, tenant_id: tenantId })
      .select('id', 'ip', 'mac', 'ips') as { id: number; ip: string | null; mac: string | null; ips: string[] | string | null }[];

    // Build lookup maps: ip → probeId  and  mac → probeId
    const probeByIp = new Map<string, number>();
    const probeByMac = new Map<string, number>();
    for (const p of siteProbes) {
      if (p.ip) probeByIp.set(p.ip, p.id);
      if (p.mac) probeByMac.set(p.mac, p.id);
      // Register ALL probe IPs from the ips JSON array (multi-homed probes)
      const allIps = p.ips != null
        ? (typeof p.ips === 'string' ? JSON.parse(p.ips) : p.ips) as string[]
        : [];
      for (const ip of allIps) {
        if (!probeByIp.has(ip)) probeByIp.set(ip, p.id);
      }
    }

    return items.map((row) => {
      const itemIp = row.ip as string;
      const itemMac = (row.mac as string | null) ?? null;
      const probeId = probeByMac.get(itemMac ?? '') ?? probeByIp.get(itemIp) ?? null;
      return {
        ...rowToItem(row),
        hasReservationConflict: reservedSet.has(itemIp),
        isProbe: probeId !== null,
        probeId,
      };
    });
  }

  async createManualItem(
    tenantId: number,
    siteId: number,
    data: {
      ip: string;
      mac?: string | null;
      customName?: string | null;
      deviceType?: DeviceType;
      notes?: string | null;
    },
  ): Promise<SiteItem> {
    const now = new Date();
    const [row] = await db('site_items')
      .insert({
        site_id: siteId,
        tenant_id: tenantId,
        ip: data.ip,
        mac: data.mac ?? null,
        custom_name: data.customName ?? null,
        device_type: data.deviceType ?? 'unknown',
        notes: data.notes ?? null,
        status: 'unknown',
        is_manual: true,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning('*');
    return rowToItem(row);
  }

  async updateItem(
    tenantId: number,
    siteId: number,
    itemId: number,
    data: Partial<{
      customName: string | null;
      deviceType: DeviceType;
      notes: string | null;
      status: SiteItem['status'];
    }>,
  ): Promise<SiteItem | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (data.customName !== undefined) patch.custom_name = data.customName;
    if (data.deviceType !== undefined) patch.device_type = data.deviceType;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status !== undefined) patch.status = data.status;

    await db('site_items')
      .where({ id: itemId, site_id: siteId, tenant_id: tenantId })
      .update(patch);

    const row = await db('site_items')
      .where({ id: itemId, site_id: siteId, tenant_id: tenantId })
      .first();
    return row ? rowToItem(row) : null;
  }

  async deleteItem(tenantId: number, siteId: number, itemId: number): Promise<void> {
    await db('site_items')
      .where({ id: itemId, site_id: siteId, tenant_id: tenantId })
      .delete();
  }

  /**
   * Delete all devices in a site whose IP starts with the given /24 prefix.
   * @param prefix e.g. "192.168.1" — matches all IPs 192.168.1.*
   */
  async deleteItemsBySubnet(tenantId: number, siteId: number, prefix: string): Promise<number> {
    const count = await db('site_items')
      .where({ site_id: siteId, tenant_id: tenantId })
      .andWhere('ip', 'like', `${prefix}.%`)
      .delete();
    return count;
  }

  // ── IP Reservations ───────────────────────────────────────────────────────

  async getReservations(tenantId: number, siteId: number): Promise<IpReservation[]> {
    const reservations = await db('ip_reservations')
      .where({ site_id: siteId, tenant_id: tenantId })
      .orderBy('ip', 'asc');

    // Mark which reserved IPs are currently occupied by a device
    const occupiedRows = await db('site_items')
      .where({ site_id: siteId, tenant_id: tenantId })
      .whereIn('ip', reservations.map((r) => r.ip as string))
      .whereNot('status', 'offline')
      .select('ip', 'mac');

    const occupiedMap = new Map<string, string | null>(
      occupiedRows.map((r) => [r.ip as string, (r.mac as string | null) ?? null]),
    );

    return reservations.map((row) => ({
      ...rowToReservation(row),
      isOccupied: occupiedMap.has(row.ip as string),
      occupiedByMac: occupiedMap.get(row.ip as string) ?? null,
    }));
  }

  async createReservation(
    tenantId: number,
    siteId: number,
    data: {
      ip: string;
      name: string;
      description?: string | null;
      deviceType?: DeviceType | null;
      createdBy?: number;
    },
  ): Promise<IpReservation> {
    const [row] = await db('ip_reservations')
      .insert({
        site_id: siteId,
        tenant_id: tenantId,
        ip: data.ip,
        name: data.name,
        description: data.description ?? null,
        device_type: data.deviceType ?? null,
        created_by: data.createdBy ?? null,
      })
      .returning('*');
    return rowToReservation(row);
  }

  async updateReservation(
    tenantId: number,
    siteId: number,
    resId: number,
    data: Partial<{ name: string; description: string | null; deviceType: DeviceType | null }>,
  ): Promise<IpReservation | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.deviceType !== undefined) patch.device_type = data.deviceType;

    await db('ip_reservations')
      .where({ id: resId, site_id: siteId, tenant_id: tenantId })
      .update(patch);

    const row = await db('ip_reservations')
      .where({ id: resId, site_id: siteId, tenant_id: tenantId })
      .first();
    return row ? rowToReservation(row) : null;
  }

  async deleteReservation(tenantId: number, siteId: number, resId: number): Promise<void> {
    await db('ip_reservations')
      .where({ id: resId, site_id: siteId, tenant_id: tenantId })
      .delete();
  }
}

export const siteService = new SiteService();
