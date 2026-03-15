import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { db } from '../db';
import { logger } from '../utils/logger';
import { SOCKET_EVENTS } from '@oblimap/shared';
import type { Probe, ProbeApiKey, ProbeScanConfig } from '@oblimap/shared';
import { liveAlertService } from './liveAlert.service';
import { notificationService } from './notification.service';

let _io: SocketIOServer | null = null;

export function setProbeServiceIO(io: SocketIOServer): void {
  _io = io;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiscoveredDevice {
  ip: string;
  mac?: string | null;
  hostname?: string | null;
  responseTimeMs?: number | null;
  isOnline: boolean;
  openPorts?: number[] | null;
}

export interface ProbePushPayload {
  hostname: string;
  probeVersion: string;
  osInfo?: Record<string, unknown>;
  probeMac?: string | null;
  discoveredDevices: DiscoveredDevice[];
  scannedSubnets: string[];
  scanDurationMs: number;
}

export interface ProbePushResponse {
  status: string;
  config: {
    scanIntervalSeconds: number;
    excludedSubnets: string[];
    extraSubnets: string[];
    portScanEnabled: boolean;
    portScanPorts: number[];
  };
  latestVersion: string | null;
  command: string | null;
}

// ─── Row Helpers ─────────────────────────────────────────────────────────────

function rowToProbe(row: Record<string, unknown>): Probe {
  return {
    id: row.id as number,
    uuid: row.uuid as string,
    hostname: row.hostname as string,
    ip: (row.ip as string | null) ?? null,
    mac: (row.mac as string | null) ?? null,
    osInfo: row.os_info != null
      ? (typeof row.os_info === 'string' ? JSON.parse(row.os_info) : row.os_info)
      : null,
    probeVersion: (row.probe_version as string | null) ?? null,
    apiKeyId: (row.api_key_id as number | null) ?? null,
    status: row.status as Probe['status'],
    tenantId: row.tenant_id as number,
    siteId: (row.site_id as number | null) ?? null,
    name: (row.name as string | null) ?? null,
    scanIntervalSeconds: (row.scan_interval_seconds as number) ?? 300,
    scanConfig: (() => {
      const v = row.scan_config;
      if (!v) return { excludedSubnets: [], extraSubnets: [] };
      return (typeof v === 'string' ? JSON.parse(v) : v) as ProbeScanConfig;
    })(),
    lastSeenAt: row.last_seen_at
      ? (row.last_seen_at as Date).toISOString()
      : null,
    pendingCommand: (row.pending_command as string | null) ?? null,
    uninstallCommandedAt: row.uninstall_commanded_at
      ? (row.uninstall_commanded_at as Date).toISOString()
      : null,
    updatingSince: row.updating_since
      ? (row.updating_since as Date).toISOString()
      : null,
    approvedBy: (row.approved_by as number | null) ?? null,
    approvedAt: row.approved_at
      ? (row.approved_at as Date).toISOString()
      : null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function rowToApiKey(row: Record<string, unknown>): ProbeApiKey {
  return {
    id: row.id as number,
    name: row.name as string,
    key: row.key as string,
    tenantId: row.tenant_id as number,
    createdBy: (row.created_by as number | null) ?? null,
    lastUsedAt: row.last_used_at
      ? (row.last_used_at as Date).toISOString()
      : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** Normalize MAC to uppercase colon-separated "AA:BB:CC:DD:EE:FF" */
function normalizeMac(mac: string): string {
  const clean = mac.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (clean.length !== 12) return mac.toUpperCase();
  return clean.match(/.{2}/g)!.join(':');
}

// ─── Vendor / Device-Type Helpers ────────────────────────────────────────────

async function lookupVendor(mac: string): Promise<string | null> {
  const prefix = mac.substring(0, 8).toUpperCase(); // "AA:BB:CC"
  const row = await db('mac_vendors').where({ prefix }).first('vendor_name', 'custom_name');
  if (!row) return null;
  // Prefer admin-defined override over IEEE default
  return (row.custom_name as string | null) ?? (row.vendor_name as string | null) ?? null;
}

async function applyVendorRules(
  tenantId: number,
  groupId: number | null,
  vendor: string | null,
): Promise<string> {
  if (!vendor) return 'unknown';
  const rules = await db('vendor_type_rules')
    .where({ tenant_id: tenantId })
    .where(function () {
      this.whereNull('group_id');
      if (groupId) this.orWhere({ group_id: groupId });
    })
    .orderBy('priority', 'desc');

  for (const rule of rules) {
    const pattern = (rule.vendor_pattern as string).toLowerCase();
    if (vendor.toLowerCase().includes(pattern)) {
      return rule.device_type as string;
    }
  }
  return 'unknown';
}

// ─── IP History ──────────────────────────────────────────────────────────────

async function recordIpHistory(
  mac: string,
  siteId: number,
  tenantId: number,
  ip: string,
  now: Date,
): Promise<void> {
  const existing = await db('item_ip_history')
    .where({ mac, site_id: siteId, ip })
    .orderBy('last_seen_at', 'desc')
    .first();
  if (existing) {
    await db('item_ip_history')
      .where({ id: existing.id as number })
      .update({ last_seen_at: now });
  } else {
    await db('item_ip_history').insert({
      mac,
      site_id: siteId,
      tenant_id: tenantId,
      ip,
      first_seen_at: now,
      last_seen_at: now,
    });
  }
}

// ─── IP Instability Detection ─────────────────────────────────────────────────

/**
 * After a push, detect IP address instability: an IP that has been claimed by
 * >= 3 distinct MACs across recent consecutive scans.
 *
 * Because a single probe reports each IP exactly once per scan, intra-push
 * conflict detection is meaningless. Instead we query item_ip_history —
 * which is written for EVERY mac→ip pair seen in every push — and look for
 * IPs with too many distinct MACs in the sliding window.
 *
 * @param seenIpMacs  Map of ip → mac from the current push (only IPs with MACs)
 * @param windowMs    Sliding window; should comfortably span 3+ scan intervals
 *                    Default: 3 × 10 min = 30 min
 */
async function checkIpInstability(
  tenantId: number,
  siteId: number,
  seenIpMacs: Map<string, string>,
  windowMs = 30 * 60 * 1000,
): Promise<void> {
  if (seenIpMacs.size === 0) return;
  const since = new Date(Date.now() - windowMs);
  const ips = [...seenIpMacs.keys()];

  let rows: { ip: string; mac: string }[];
  try {
    rows = await db('item_ip_history')
      .where({ site_id: siteId, tenant_id: tenantId })
      .whereIn('ip', ips)
      .where('last_seen_at', '>=', since)
      .select('ip', 'mac') as { ip: string; mac: string }[];
  } catch (err) {
    logger.warn({ err }, 'IP instability query failed');
    return;
  }

  // Group distinct MACs per IP
  const macsByIp = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!macsByIp.has(row.ip)) macsByIp.set(row.ip, new Set());
    macsByIp.get(row.ip)!.add(row.mac);
  }

  for (const [ip, macs] of macsByIp) {
    if (macs.size < 3) continue;

    const macList = [...macs].join(', ');
    const stableKey = `ip-instability:${siteId}:${ip}`;

    logger.warn({ ip, siteId, tenantId, distinctMacs: macs.size }, 'IP instability detected');

    try {
      await liveAlertService.add(tenantId, {
        severity: 'warning',
        title: `IP Instability: ${ip}`,
        message: `${macs.size} different MACs claimed ${ip} across the last 3 scans: ${macList}`,
        navigateTo: `/sites/${siteId}`,
        stableKey,
      });
    } catch (err) {
      logger.warn({ err, ip }, 'Failed to create IP instability alert');
    }

    _io
      ?.to(`tenant:${tenantId}:admin`)
      .emit(SOCKET_EVENTS.IP_CONFLICT_DETECTED, {
        ip,
        siteId,
        tenantId,
        distinctMacs: macs.size,
        macs: [...macs],
      });
  }
}

// ─── Device Processing ───────────────────────────────────────────────────────

async function processDevices(
  probeId: number,
  tenantId: number,
  siteId: number,
  siteGroupId: number | null,
  siteName: string,
  devices: DiscoveredDevice[],
  probeMac: string | null,
): Promise<void> {
  const now = new Date();
  const updatedItemIds: number[] = [];
  // ip → mac for every device with a known MAC seen in this push.
  // Written to item_ip_history unconditionally (idempotent) so the
  // instability detector can count distinct MACs per IP across scans.
  const seenIpMacs = new Map<string, string>();

  for (const device of devices) {
    const mac = device.mac ? normalizeMac(device.mac) : null;
    const ip = device.ip;
    const status = device.isOnline ? 'online' : 'offline';

    try {
      let existingItem: Record<string, unknown> | undefined;

      // 1. Try to find by MAC (MAC is the tracking key — follows device across IP changes)
      if (mac) {
        existingItem = await db('site_items')
          .where({ site_id: siteId, mac })
          .first();
      }

      // 2. If no MAC match, try by IP
      if (!existingItem) {
        existingItem = await db('site_items')
          .where({ site_id: siteId, ip })
          .first();
      }

      if (existingItem) {
        const updates: Record<string, unknown> = {
          status,
          last_seen_at: now,
          updated_at: now,
          discovered_by_probe_id: probeId,
        };
        // Update open_ports if the probe ran a port scan (non-null array)
        if (device.openPorts != null) {
          updates.open_ports = JSON.stringify(device.openPorts);
        }

        // MAC-based tracking: IP moved?
        if (mac && existingItem.ip !== ip) {
          updates.ip = ip;
          _io
            ?.to(`tenant:${tenantId}:admin`)
            .emit(SOCKET_EVENTS.DEVICE_IP_CHANGED, {
              itemId: existingItem.id,
              mac,
              oldIp: existingItem.ip,
              newIp: ip,
              siteId,
            });
        }

        // Always record mac→ip in history (idempotent: updates last_seen_at
        // if the pair already exists). This feeds the cross-scan instability detector.
        if (mac) {
          seenIpMacs.set(ip, mac);
          await recordIpHistory(mac, siteId, tenantId, ip, now).catch(() => {});
        }

        if (device.hostname && existingItem.hostname !== device.hostname) {
          updates.hostname = device.hostname;
        }

        if (!existingItem.vendor && mac) {
          const vendor = await lookupVendor(mac);
          if (vendor) updates.vendor = vendor;
        }

        await db('site_items')
          .where({ id: existingItem.id as number })
          .update(updates);

        // If this device IS the probe itself (MAC match), keep probe.ip in sync
        if (probeMac && mac === probeMac) {
          await db('probes').where({ id: probeId }).update({ ip, updated_at: now }).catch(() => {});
        }

        updatedItemIds.push(existingItem.id as number);

        if (existingItem.status !== status) {
          _io
            ?.to(`tenant:${tenantId}:admin`)
            .emit(SOCKET_EVENTS.ITEM_STATUS_CHANGED, {
              itemId: existingItem.id,
              status,
              siteId,
            });
        }
      } else {
        // New device discovered
        const vendor = mac ? await lookupVendor(mac) : null;
        const deviceType = await applyVendorRules(tenantId, null, vendor);

        const [newItem] = await db('site_items')
          .insert({
            site_id: siteId,
            tenant_id: tenantId,
            ip,
            mac: mac ?? null,
            hostname: device.hostname ?? null,
            status,
            vendor,
            device_type: deviceType,
            is_manual: false,
            discovered_by_probe_id: probeId,
            open_ports: device.openPorts != null ? JSON.stringify(device.openPorts) : null,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
            updated_at: now,
          })
          .returning('id');

        const itemId = newItem.id as number;
        updatedItemIds.push(itemId);

        if (mac) {
          seenIpMacs.set(ip, mac);
          await recordIpHistory(mac, siteId, tenantId, ip, now);
        }

        // If this new device IS the probe itself, sync probe.ip
        if (probeMac && mac === probeMac) {
          await db('probes').where({ id: probeId }).update({ ip, updated_at: now }).catch(() => {});
        }

        _io
          ?.to(`tenant:${tenantId}:admin`)
          .emit(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, {
            itemId,
            ip,
            mac,
            siteId,
            vendor,
            deviceType,
          });

        // Notification: new device found on this site
        void notificationService.sendForSite(tenantId, siteGroupId, {
          monitorName: `New device on ${siteName}`,
          oldStatus: 'unknown',
          newStatus: 'up',
          message: `A new device was discovered at ${ip}${mac ? ` (${mac})` : ''}${vendor ? ` — ${vendor}` : ''} on site "${siteName}".`,
          timestamp: now.toISOString(),
          isIpamNotification: true,
          siteName,
          siteId,
          deviceIp: ip,
          deviceMac: mac,
          deviceName: device.hostname ?? null,
        }).catch((err) => logger.warn({ err }, 'IPAM new-device notification failed'));
      }
    } catch (err) {
      logger.warn({ err, ip, mac }, 'Failed to upsert site item');
    }
  }

  // Mark items from this probe as offline if not seen in current push
  try {
    const offlineQuery = db('site_items').where({
      site_id: siteId,
      tenant_id: tenantId,
      discovered_by_probe_id: probeId,
      is_manual: false,
      status: 'online',
    });
    if (updatedItemIds.length > 0) {
      offlineQuery.whereNotIn('id', updatedItemIds);
    }

    // Fetch items going offline so we can notify and emit socket events
    const goingOffline = await offlineQuery.clone().select('id', 'ip', 'mac', 'custom_name', 'hostname');

    if (goingOffline.length > 0) {
      await offlineQuery.update({ status: 'offline', updated_at: now });

      for (const item of goingOffline) {
        const itemId = item.id as number;
        const ip = item.ip as string;
        const mac = (item.mac as string | null) ?? null;
        const name = (item.custom_name as string | null)
          ?? (item.hostname as string | null)
          ?? ip;

        _io
          ?.to(`tenant:${tenantId}:admin`)
          .emit(SOCKET_EVENTS.ITEM_STATUS_CHANGED, { itemId, status: 'offline', siteId });

        void notificationService.sendForSite(tenantId, siteGroupId, {
          monitorName: `Device offline on ${siteName}`,
          oldStatus: 'up',
          newStatus: 'down',
          message: `Device "${name}" (${ip}${mac ? ` / ${mac}` : ''}) on site "${siteName}" has gone offline.`,
          timestamp: now.toISOString(),
          isIpamNotification: true,
          siteName,
          siteId,
          deviceIp: ip,
          deviceMac: mac,
          deviceName: name,
        }).catch((err) => logger.warn({ err, ip }, 'IPAM offline notification failed'));
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to mark offline items');
  }

  // Run IP instability detection across scans (fire-and-forget, errors logged inside)
  void checkIpInstability(tenantId, siteId, seenIpMacs);
}

// ─── Probe Service ────────────────────────────────────────────────────────────

class ProbeService {
  // ── Push ──────────────────────────────────────────────────────────────────

  async handlePush(
    apiKeyValue: string,
    probeUuid: string,
    payload: ProbePushPayload,
  ): Promise<ProbePushResponse & { httpStatus: number }> {
    const apiKey = await db('probe_api_keys').where({ key: apiKeyValue }).first();

    if (!apiKey) {
      return {
        httpStatus: 401,
        status: 'unauthorized',
        config: { scanIntervalSeconds: 300, excludedSubnets: [], extraSubnets: [], portScanEnabled: false, portScanPorts: [] },
        latestVersion: null,
        command: null,
      };
    }

    const tenantId = apiKey.tenant_id as number;
    const now = new Date();

    await db('probe_api_keys')
      .where({ id: apiKey.id as number })
      .update({ last_used_at: now });

    // Find or register probe
    let probe = await db('probes')
      .where({ uuid: probeUuid, tenant_id: tenantId })
      .first();

    if (!probe) {
      const [newProbe] = await db('probes')
        .insert({
          uuid: probeUuid,
          hostname: payload.hostname,
          ip: null,
          mac: payload.probeMac ? normalizeMac(payload.probeMac) : null,
          os_info: payload.osInfo ? JSON.stringify(payload.osInfo) : null,
          probe_version: payload.probeVersion,
          api_key_id: apiKey.id as number,
          status: 'pending',
          tenant_id: tenantId,
          site_id: null,
          name: payload.hostname,
          scan_interval_seconds: 300,
          scan_config: JSON.stringify({ excludedSubnets: [], extraSubnets: [] }),
          last_seen_at: now,
          created_at: now,
          updated_at: now,
        })
        .returning('*');
      probe = newProbe;

      _io
        ?.to(`tenant:${tenantId}:admin`)
        .emit(SOCKET_EVENTS.PROBE_STATUS_CHANGED, {
          probeId: probe.id,
          status: 'pending',
          uuid: probeUuid,
        });

      logger.info(
        { uuid: probeUuid, hostname: payload.hostname, tenantId },
        'New probe registered (pending)',
      );
    } else {
      const updates: Record<string, unknown> = {
        hostname: payload.hostname,
        probe_version: payload.probeVersion,
        last_seen_at: now,
        updated_at: now,
      };
      if (payload.osInfo) updates.os_info = JSON.stringify(payload.osInfo);
      if (payload.probeMac) updates.mac = normalizeMac(payload.probeMac);
      if (probe.api_key_id !== (apiKey.id as number)) updates.api_key_id = apiKey.id;
      // Clear updating_since if version changed
      if (probe.updating_since && probe.probe_version !== payload.probeVersion) {
        updates.updating_since = null;
      }

      await db('probes').where({ id: probe.id as number }).update(updates);
      // Refresh probe data
      probe = await db('probes').where({ id: probe.id as number }).first();
    }

    const probeStatus = probe.status as string;
    const scanConfig = (() => {
      const v = probe.scan_config;
      if (!v) return { excludedSubnets: [], extraSubnets: [] };
      return (typeof v === 'string' ? JSON.parse(v) : v) as ProbeScanConfig;
    })();

    // Process discovered devices (approved probes with a site assignment only)
    if (probeStatus === 'approved' && probe.site_id) {
      // Look up site info so processDevices can include it in notifications
      const site = await db('sites')
        .where({ id: probe.site_id as number, tenant_id: tenantId })
        .first('id', 'name', 'group_id');

      await processDevices(
        probe.id as number,
        tenantId,
        probe.site_id as number,
        (site?.group_id as number | null) ?? null,
        (site?.name as string | null) ?? `Site #${probe.site_id as number}`,
        payload.discoveredDevices,
        payload.probeMac ? normalizeMac(payload.probeMac) : null,
      ).catch((err) => logger.error({ err }, 'Device processing failed'));
    }

    // Deliver pending command (one-shot — clear after reading)
    const command = (probe.pending_command as string | null) ?? null;
    if (command) {
      await db('probes').where({ id: probe.id as number }).update({
        pending_command: null,
        updated_at: now,
        ...(command === 'uninstall' ? { uninstall_commanded_at: now } : {}),
        ...(command === 'update' ? { updating_since: now } : {}),
      });
    }

    // Read the version from probe/VERSION (or probe/main.go as fallback) — same
    // source as the GET /api/probe/version endpoint, so the probe always gets the
    // real current version instead of a stale/missing DB value.
    const latestVersion = this.getProbeVersion().version;

    return {
      httpStatus: probeStatus === 'pending' ? 202 : 200,
      status: probeStatus,
      config: {
        scanIntervalSeconds: (probe.scan_interval_seconds as number) ?? 300,
        excludedSubnets: scanConfig.excludedSubnets ?? [],
        extraSubnets: scanConfig.extraSubnets ?? [],
        portScanEnabled: scanConfig.portScanEnabled ?? false,
        portScanPorts: scanConfig.portScanPorts ?? [],
      },
      latestVersion,
      command,
    };
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async getApiKeys(tenantId: number): Promise<ProbeApiKey[]> {
    const rows = await db('probe_api_keys')
      .where({ tenant_id: tenantId })
      .orderBy('created_at', 'asc');
    return rows.map(rowToApiKey);
  }

  async createApiKey(
    tenantId: number,
    name: string,
    createdBy: number,
  ): Promise<ProbeApiKey> {
    const { randomUUID } = await import('node:crypto');
    const key = randomUUID();
    const [row] = await db('probe_api_keys')
      .insert({ name, key, tenant_id: tenantId, created_by: createdBy })
      .returning('*');
    return rowToApiKey(row);
  }

  async deleteApiKey(tenantId: number, id: number): Promise<void> {
    await db('probe_api_keys').where({ id, tenant_id: tenantId }).delete();
  }

  // ── Probe CRUD ────────────────────────────────────────────────────────────

  async getProbes(tenantId: number): Promise<Probe[]> {
    const rows = await db('probes')
      .where({ tenant_id: tenantId })
      .orderBy('created_at', 'asc');
    return rows.map(rowToProbe);
  }

  async getProbe(tenantId: number, id: number): Promise<Probe | null> {
    const row = await db('probes').where({ id, tenant_id: tenantId }).first();
    return row ? rowToProbe(row) : null;
  }

  async updateProbe(
    tenantId: number,
    id: number,
    updates: Partial<{
      name: string;
      siteId: number | null;
      scanIntervalSeconds: number;
      scanConfig: ProbeScanConfig;
    }>,
  ): Promise<Probe | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.siteId !== undefined) patch.site_id = updates.siteId;
    if (updates.scanIntervalSeconds !== undefined)
      patch.scan_interval_seconds = updates.scanIntervalSeconds;
    if (updates.scanConfig !== undefined)
      patch.scan_config = JSON.stringify(updates.scanConfig);

    await db('probes').where({ id, tenant_id: tenantId }).update(patch);
    return this.getProbe(tenantId, id);
  }

  async approveProbe(tenantId: number, id: number, approvedBy: number): Promise<Probe | null> {
    const now = new Date();
    await db('probes').where({ id, tenant_id: tenantId }).update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: now,
      updated_at: now,
    });
    const probe = await this.getProbe(tenantId, id);
    if (probe) {
      _io
        ?.to(`tenant:${tenantId}:admin`)
        .emit(SOCKET_EVENTS.PROBE_APPROVED, { probeId: id });
    }
    return probe;
  }

  async refuseProbe(tenantId: number, id: number): Promise<void> {
    await db('probes').where({ id, tenant_id: tenantId }).update({
      status: 'refused',
      updated_at: new Date(),
    });
  }

  async sendCommand(tenantId: number, id: number, command: string): Promise<void> {
    await db('probes').where({ id, tenant_id: tenantId }).update({
      pending_command: command,
      updated_at: new Date(),
    });
  }

  async deleteProbe(tenantId: number, id: number): Promise<void> {
    await db('probes').where({ id, tenant_id: tenantId }).delete();
  }

  // ── Bulk Operations ───────────────────────────────────────────────────────

  async bulkApprove(tenantId: number, ids: number[], approvedBy: number): Promise<void> {
    const now = new Date();
    await db('probes')
      .where({ tenant_id: tenantId })
      .whereIn('id', ids)
      .update({ status: 'approved', approved_by: approvedBy, approved_at: now, updated_at: now });
  }

  async bulkDelete(tenantId: number, ids: number[]): Promise<void> {
    await db('probes').where({ tenant_id: tenantId }).whereIn('id', ids).delete();
  }

  async bulkCommand(tenantId: number, ids: number[], command: string): Promise<void> {
    await db('probes')
      .where({ tenant_id: tenantId })
      .whereIn('id', ids)
      .update({ pending_command: command, updated_at: new Date() });
  }

  // ── Cleanup Jobs ──────────────────────────────────────────────────────────

  async cleanupUninstalledProbes(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const deleted = await db('probes')
      .whereNotNull('uninstall_commanded_at')
      .where('uninstall_commanded_at', '<', cutoff)
      .delete()
      .returning('id');
    if (deleted.length > 0) {
      logger.info({ count: deleted.length }, 'Cleaned up uninstalled probes');
    }
  }

  async cleanupStuckUpdating(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const count = await db('probes')
      .whereNotNull('updating_since')
      .where('updating_since', '<', cutoff)
      .update({ updating_since: null });
    if (count > 0) {
      logger.info({ count }, 'Cleared stuck-updating probes');
    }
  }

  // ── Version + installer helpers ──────────────────────────────────────────

  getProbeVersion(): { version: string } {
    // 1. Try probe/VERSION (plain text "X.Y.Z\n") — present in prod Docker image
    try {
      const versionFilePath = path.resolve(__dirname, '../../../../probe/VERSION');
      const v = fs.readFileSync(versionFilePath, 'utf-8').trim();
      if (v) return { version: v };
    } catch { /* not found, try next */ }

    // 2. Dev fallback: parse `var ProbeVersion = "x.y.z"` from probe/main.go
    try {
      const mainGoPath = path.resolve(__dirname, '../../../../probe/main.go');
      const content = fs.readFileSync(mainGoPath, 'utf-8');
      const match = content.match(/var\s+ProbeVersion\s*=\s*"([^"]+)"/);
      if (match?.[1] && match[1] !== 'dev') return { version: match[1] };
    } catch { /* not found */ }

    return { version: '0.0.0' };
  }

  /**
   * Mark a probe as "updating" — called when the probe notifies us it is
   * about to self-update. Sets updating_since to NOW().
   */
  async setProbeUpdating(probeUuid: string): Promise<void> {
    await db('probes')
      .where({ uuid: probeUuid })
      .update({ updating_since: new Date(), updated_at: new Date() });
    logger.info(`Probe ${probeUuid} is self-updating.`);
  }

  async getProbeByUuid(uuid: string): Promise<{ id: number; api_key_id: number } | null> {
    const row = await db('probes').where({ uuid }).select('id', 'api_key_id').first() as
      { id: number; api_key_id: number } | undefined;
    return row ?? null;
  }

  async getApiKeyIdByKey(rawKey: string): Promise<number | null> {
    const row = await db('probe_api_keys').where({ key: rawKey }).select('id').first() as
      { id: number } | undefined;
    return row?.id ?? null;
  }
}

export const probeService = new ProbeService();
