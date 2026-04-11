import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { db } from '../db';
import { logger } from '../utils/logger';
import { SOCKET_EVENTS } from '@oblimap/shared';
import type { Probe, ProbeApiKey, ProbeScanConfig, FlowEntry } from '@oblimap/shared';
import { liveAlertService } from './liveAlert.service';
import { notificationService } from './notification.service';
import { obligateService } from './obligate.service';
import { settingsService } from './settings.service';
import { flowService } from './flow.service';

let _io: SocketIOServer | null = null;

export function setProbeServiceIO(io: SocketIOServer): void {
  _io = io;
}

/** Check if a probe is connected via WebSocket (lazy import to avoid circular deps) */
function isProbeWsConnected(probeId: number): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isProbeConnected } = require('../socket');
    return isProbeConnected(probeId);
  } catch {
    return false;
  }
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
  probeIPs?: string[];
  discoveredDevices: DiscoveredDevice[];
  discoveredFlows?: FlowEntry[];
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
    flowAnalysisEnabled: boolean;
  };
  latestVersion: string | null;
  command: string | null;
  role?: 'primary' | 'secondary';
}

// ─── Row Helpers ─────────────────────────────────────────────────────────────

function rowToProbe(row: Record<string, unknown>): Probe {
  return {
    id: row.id as number,
    uuid: row.uuid as string,
    hostname: row.hostname as string,
    ip: (row.ip as string | null) ?? null,
    mac: (row.mac as string | null) ?? null,
    ips: row.ips != null
      ? (typeof row.ips === 'string' ? JSON.parse(row.ips) : row.ips) as string[]
      : null,
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
    scanConfigOverride: (row.scan_config_override as boolean | undefined) ?? true,
    isPrimary: (row.is_primary as boolean | undefined) ?? false,
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

// ─── Dedup Cache ────────────────────────────────────────────────────────────
// When multiple probes scan the same site, they may report identical changes.
// The dedup cache suppresses duplicate Socket.io events and alerts within a TTL.
// Exception: IP_CONFLICT_DETECTED events are NEVER deduplicated.

interface DedupEntry {
  ts: number;
  probeId: number;
  isPrimary: boolean;
}

const dedupCache = new Map<string, DedupEntry>();
const DEDUP_TTL_MS = 60_000;

function dedupKey(tenantId: number, siteId: number, mac: string | null, changeType: string): string {
  return `${tenantId}:${siteId}:${mac ?? 'null'}:${changeType}`;
}

/**
 * Check if an event should be suppressed by dedup.
 * Returns true if the event should be SKIPPED (already reported within TTL).
 * MAC/IP conflict events (changeType='conflict') are never suppressed.
 */
function shouldDedup(
  tenantId: number,
  siteId: number,
  mac: string | null,
  changeType: string,
  probeId: number,
  isPrimary: boolean,
): boolean {
  if (changeType === 'conflict') return false; // Never dedup conflicts

  const key = dedupKey(tenantId, siteId, mac, changeType);
  const existing = dedupCache.get(key);
  const now = Date.now();

  if (existing && now - existing.ts < DEDUP_TTL_MS) {
    // Already reported within TTL
    if (isPrimary && !existing.isPrimary) {
      // Primary takes precedence — update cache but don't skip
      dedupCache.set(key, { ts: now, probeId, isPrimary });
      return false;
    }
    return true; // Skip duplicate
  }

  // Not in cache or expired — process and cache
  dedupCache.set(key, { ts: now, probeId, isPrimary });
  return false;
}

/** Cleanup expired entries — called periodically */
export function cleanupDedupCache(): void {
  const now = Date.now();
  for (const [key, entry] of dedupCache) {
    if (now - entry.ts > DEDUP_TTL_MS) {
      dedupCache.delete(key);
    }
  }
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
  isProbePrimary = false,
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
        const ipItem = await db('site_items')
          .where({ site_id: siteId, ip })
          .first();

        if (ipItem && mac && ipItem.mac && (ipItem.mac as string) !== mac) {
          // IP takeover: the IP was previously held by a different MAC.
          // Do NOT overwrite the old device — it keeps its customizations
          // (custom_name, device_type, notes) and stays offline until its
          // MAC reappears on a new IP.  Create the new device instead.
          const oldName = (ipItem.custom_name as string) || (ipItem.hostname as string) || (ipItem.ip as string);
          await liveAlertService.add(tenantId, {
            severity: 'warning',
            title: `IP Takeover: ${ip}`,
            message: `${ip} was used by "${oldName}" (${ipItem.mac as string}) and is now claimed by a new device (${mac}).`,
            navigateTo: `/site/${siteId}`,
            stableKey: `ip-takeover:${siteId}:${ip}:${mac}`,
          });
          // Leave existingItem undefined so a new device row is created below
        } else {
          existingItem = ipItem;
        }
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

        // Fill in MAC if the existing item had none (e.g. probe's own device
        // was previously discovered via TCP scan without ARP entry)
        if (mac && !existingItem.mac) {
          updates.mac = mac;
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
          const changeType = status === 'online' ? 'online' : 'offline';
          if (!shouldDedup(tenantId, siteId, mac, changeType, probeId, isProbePrimary)) {
            _io
              ?.to(`tenant:${tenantId}:admin`)
              .emit(SOCKET_EVENTS.ITEM_STATUS_CHANGED, {
                itemId: existingItem.id,
                status,
                siteId,
              });
          }
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

        if (!shouldDedup(tenantId, siteId, mac, 'new', probeId, isProbePrimary)) {
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
        }

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
        }, siteId).catch((err) => logger.warn({ err }, 'IPAM new-device notification failed'));
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
        }, siteId).catch((err) => logger.warn({ err, ip }, 'IPAM offline notification failed'));
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
        config: { scanIntervalSeconds: 300, excludedSubnets: [], extraSubnets: [], portScanEnabled: false, portScanPorts: [], flowAnalysisEnabled: false },
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
          ips: payload.probeIPs ? JSON.stringify(payload.probeIPs) : null,
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
      if (payload.probeIPs) updates.ips = JSON.stringify(payload.probeIPs);
      if (probe.api_key_id !== (apiKey.id as number)) updates.api_key_id = apiKey.id;
      // Clear updating_since if version changed
      if (probe.updating_since && probe.probe_version !== payload.probeVersion) {
        updates.updating_since = null;
      }

      await db('probes').where({ id: probe.id as number }).update(updates);
      // Refresh probe data
      probe = await db('probes').where({ id: probe.id as number }).first();
    }

    // Register/update probe UUID with Obligate for cross-app linking (non-blocking, idempotent)
    obligateService.registerDeviceLink(probeUuid, `/probes/${probe.id}`).catch(() => {});

    // ── Primary auto-election ──
    // If this probe is approved, assigned to a site, and no primary exists for that site,
    // auto-promote this probe. If the current primary has been offline > 5 min, promote too.
    if ((probe.status as string) === 'approved' && probe.site_id) {
      const currentPrimary = await db('probes')
        .where({ site_id: probe.site_id, tenant_id: tenantId, is_primary: true })
        .first();

      if (!currentPrimary) {
        // No primary — promote this probe
        await db('probes').where({ id: probe.id as number }).update({ is_primary: true });
        probe.is_primary = true;
        logger.info({ probeId: probe.id, siteId: probe.site_id }, 'Auto-promoted probe to primary (no existing primary)');
      } else if (
        currentPrimary.id !== probe.id &&
        currentPrimary.last_seen_at &&
        (now.getTime() - new Date(currentPrimary.last_seen_at as string).getTime()) > 5 * 60 * 1000
      ) {
        // Current primary has been offline > 5 min — promote this probe
        await db('probes').where({ id: currentPrimary.id as number }).update({ is_primary: false });
        await db('probes').where({ id: probe.id as number }).update({ is_primary: true });
        probe.is_primary = true;
        logger.info(
          { probeId: probe.id, oldPrimaryId: currentPrimary.id, siteId: probe.site_id },
          'Auto-promoted probe to primary (old primary offline > 5min)',
        );
      }
    }

    const probeStatus = probe.status as string;
    const scanConfig = (() => {
      const v = probe.scan_config;
      if (!v) return { excludedSubnets: [], extraSubnets: [] };
      return (typeof v === 'string' ? JSON.parse(v) : v) as ProbeScanConfig;
    })();

    // Process discovered devices (approved probes with a site assignment only)
    let siteGroupId: number | null = null;
    if (probeStatus === 'approved' && probe.site_id) {
      const site = await db('sites')
        .where({ id: probe.site_id as number, tenant_id: tenantId })
        .first('id', 'name', 'group_id');

      siteGroupId = (site?.group_id as number | null) ?? null;

      await processDevices(
        probe.id as number,
        tenantId,
        probe.site_id as number,
        siteGroupId,
        (site?.name as string | null) ?? `Site #${probe.site_id as number}`,
        payload.discoveredDevices,
        payload.probeMac ? normalizeMac(payload.probeMac) : null,
        Boolean(probe.is_primary),
      ).catch((err) => logger.error({ err }, 'Device processing failed'));

      // Process network flows if present
      if (payload.discoveredFlows && payload.discoveredFlows.length > 0) {
        await flowService.processFlows(tenantId, probe.site_id as number, probe.id as number, payload.discoveredFlows)
          .catch((err) => logger.error({ err }, 'Flow processing failed'));
      }

      _io?.to(`tenant:${tenantId}:admin`).emit(SOCKET_EVENTS.SITE_UPDATED, { siteId: probe.site_id });
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

    const latestVersion = this.getProbeVersion().version;

    const useScanConfigOverride = (probe.scan_config_override as boolean | undefined) ?? true;

    let effectiveConfig: {
      scanIntervalSeconds: number;
      excludedSubnets: string[];
      extraSubnets: string[];
      portScanEnabled: boolean;
      portScanPorts: number[];
      flowAnalysisEnabled: boolean;
    };

    // flowAnalysisEnabled is always resolved from the settings chain (site/group level),
    // never from the probe's own scan_config — it's a site-level feature toggle.
    let flowEnabled = false;
    if (probe.site_id) {
      try {
        const siteSettings = await settingsService.resolveForSite(tenantId, probe.site_id as number);
        const v = siteSettings.flowAnalysisEnabled?.value;
        flowEnabled = v === true || v === 'true';
      } catch { /* ignore */ }
    }

    if (useScanConfigOverride) {
      effectiveConfig = {
        scanIntervalSeconds: (probe.scan_interval_seconds as number) ?? 300,
        excludedSubnets: scanConfig.excludedSubnets ?? [],
        extraSubnets: scanConfig.extraSubnets ?? [],
        portScanEnabled: scanConfig.portScanEnabled ?? false,
        portScanPorts: scanConfig.portScanPorts ?? [],
        flowAnalysisEnabled: flowEnabled,
      };
    } else {
      const resolved = await settingsService.resolveForProbe(
        tenantId,
        probe.id as number,
        (probe.site_id as number | null) ?? null,
        siteGroupId,
      );
      effectiveConfig = {
        scanIntervalSeconds: (resolved.scanIntervalSeconds.value as number) ?? 300,
        excludedSubnets: (resolved.excludedSubnets.value as string[] | string) ? (Array.isArray(resolved.excludedSubnets.value) ? resolved.excludedSubnets.value as string[] : JSON.parse(resolved.excludedSubnets.value as string)) : [],
        extraSubnets: (resolved.extraSubnets.value as string[] | string) ? (Array.isArray(resolved.extraSubnets.value) ? resolved.extraSubnets.value as string[] : JSON.parse(resolved.extraSubnets.value as string)) : [],
        portScanEnabled: (resolved.portScanEnabled.value as boolean) ?? false,
        portScanPorts: (resolved.portScanPorts.value as number[] | string) ? (Array.isArray(resolved.portScanPorts.value) ? resolved.portScanPorts.value as number[] : JSON.parse(resolved.portScanPorts.value as string)) : [],
        flowAnalysisEnabled: flowEnabled,
      };
    }

    return {
      httpStatus: probeStatus === 'pending' ? 202 : 200,
      status: probeStatus,
      config: effectiveConfig,
      latestVersion,
      command,
      role: (probe.is_primary as boolean) ? 'primary' as const : 'secondary' as const,
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
    return rows.map((r) => ({ ...rowToProbe(r), wsConnected: isProbeWsConnected(r.id as number) }));
  }

  async getProbe(tenantId: number, id: number): Promise<Probe | null> {
    const row = await db('probes').where({ id, tenant_id: tenantId }).first();
    return row ? { ...rowToProbe(row), wsConnected: isProbeWsConnected(id) } : null;
  }

  async updateProbe(
    tenantId: number,
    id: number,
    updates: Partial<{
      name: string;
      siteId: number | null;
      scanIntervalSeconds: number;
      scanConfig: ProbeScanConfig;
      scanConfigOverride: boolean;
      isPrimary: boolean;
    }>,
  ): Promise<Probe | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.siteId !== undefined) patch.site_id = updates.siteId;
    if (updates.scanIntervalSeconds !== undefined)
      patch.scan_interval_seconds = updates.scanIntervalSeconds;
    if (updates.scanConfig !== undefined)
      patch.scan_config = JSON.stringify(updates.scanConfig);
    if (updates.scanConfigOverride !== undefined)
      patch.scan_config_override = updates.scanConfigOverride;
    if (updates.isPrimary !== undefined) {
      patch.is_primary = updates.isPrimary;
      // If promoting to primary, demote any existing primary on the same site
      if (updates.isPrimary) {
        const probe = await db('probes').where({ id, tenant_id: tenantId }).first('site_id');
        if (probe?.site_id) {
          await db('probes')
            .where({ site_id: probe.site_id, tenant_id: tenantId, is_primary: true })
            .whereNot({ id })
            .update({ is_primary: false });
        }
      }
    }

    await db('probes').where({ id, tenant_id: tenantId }).update(patch);

    // If probe is WS-connected, push config update immediately
    const { isProbeConnected, sendToProbe } = await import('../socket');
    if (isProbeConnected(id)) {
      const updatedProbe = await this.getProbe(tenantId, id);
      if (updatedProbe) {
        const { PROBE_WS_EVENTS } = await import('@oblimap/shared');
        // Rebuild effective config and push
        const effectiveConfig = await this.buildEffectiveConfig(tenantId, id);
        if (effectiveConfig) {
          sendToProbe(id, PROBE_WS_EVENTS.CONFIG_UPDATE, {
            status: updatedProbe.status,
            config: effectiveConfig,
            latestVersion: this.getProbeVersion().version,
            command: null,
          });
        }
      }
    }

    return this.getProbe(tenantId, id);
  }

  /** Build the effective config for a probe (used by both HTTP push and WS config push) */
  async buildEffectiveConfig(tenantId: number, probeId: number): Promise<ProbePushResponse['config'] | null> {
    const probe = await db('probes').where({ id: probeId, tenant_id: tenantId }).first();
    if (!probe) return null;

    const scanConfig = (() => {
      const v = probe.scan_config;
      if (!v) return { excludedSubnets: [], extraSubnets: [] };
      return (typeof v === 'string' ? JSON.parse(v) : v) as ProbeScanConfig;
    })();

    let flowEnabled = false;
    if (probe.site_id) {
      try {
        const siteSettings = await settingsService.resolveForSite(tenantId, probe.site_id as number);
        const v = siteSettings.flowAnalysisEnabled?.value;
        flowEnabled = v === true || v === 'true';
      } catch { /* ignore */ }
    }

    const useScanConfigOverride = (probe.scan_config_override as boolean | undefined) ?? true;

    if (useScanConfigOverride) {
      return {
        scanIntervalSeconds: (probe.scan_interval_seconds as number) ?? 300,
        excludedSubnets: scanConfig.excludedSubnets ?? [],
        extraSubnets: scanConfig.extraSubnets ?? [],
        portScanEnabled: scanConfig.portScanEnabled ?? false,
        portScanPorts: scanConfig.portScanPorts ?? [],
        flowAnalysisEnabled: flowEnabled,
      };
    }

    const siteGroupId = probe.site_id
      ? ((await db('sites').where({ id: probe.site_id }).first('group_id'))?.group_id as number | null) ?? null
      : null;

    const resolved = await settingsService.resolveForProbe(
      tenantId,
      probeId,
      (probe.site_id as number | null) ?? null,
      siteGroupId,
    );

    return {
      scanIntervalSeconds: (resolved.scanIntervalSeconds.value as number) ?? 300,
      excludedSubnets: (resolved.excludedSubnets.value as string[] | string) ? (Array.isArray(resolved.excludedSubnets.value) ? resolved.excludedSubnets.value as string[] : JSON.parse(resolved.excludedSubnets.value as string)) : [],
      extraSubnets: (resolved.extraSubnets.value as string[] | string) ? (Array.isArray(resolved.extraSubnets.value) ? resolved.extraSubnets.value as string[] : JSON.parse(resolved.extraSubnets.value as string)) : [],
      portScanEnabled: (resolved.portScanEnabled.value as boolean) ?? false,
      portScanPorts: (resolved.portScanPorts.value as number[] | string) ? (Array.isArray(resolved.portScanPorts.value) ? resolved.portScanPorts.value as number[] : JSON.parse(resolved.portScanPorts.value as string)) : [],
      flowAnalysisEnabled: flowEnabled,
    };
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
    // Store in DB for HTTP fallback
    await db('probes').where({ id, tenant_id: tenantId }).update({
      pending_command: command,
      updated_at: new Date(),
    });

    // If probe is WS-connected, deliver instantly and clear pending_command
    const { isProbeConnected, sendToProbe } = await import('../socket');
    if (isProbeConnected(id)) {
      const { PROBE_WS_EVENTS } = await import('@oblimap/shared');
      sendToProbe(id, PROBE_WS_EVENTS.COMMAND, { command });
      await db('probes').where({ id, tenant_id: tenantId }).update({
        pending_command: null,
        ...(command === 'uninstall' ? { uninstall_commanded_at: new Date() } : {}),
        ...(command === 'update' ? { updating_since: new Date() } : {}),
      });
    }
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

    // Deliver instantly to WS-connected probes
    const { isProbeConnected: isConn, sendToProbe: sendTo } = await import('../socket');
    const { PROBE_WS_EVENTS: PWS } = await import('@oblimap/shared');
    for (const id of ids) {
      if (isConn(id)) {
        sendTo(id, PWS.COMMAND, { command });
        await db('probes').where({ id, tenant_id: tenantId }).update({
          pending_command: null,
          ...(command === 'uninstall' ? { uninstall_commanded_at: new Date() } : {}),
          ...(command === 'update' ? { updating_since: new Date() } : {}),
        });
      }
    }
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
