import { db } from '../db';
import type { AgentApiKey, AgentDevice } from '@obliview/shared';
import { heartbeatService } from './heartbeat.service';
import { monitorService } from './monitor.service';
import { logger } from '../utils/logger';

// ============================================================
// Row ↔ Model helpers
// ============================================================

interface AgentApiKeyRow {
  id: number;
  name: string;
  key: string;
  created_by: number | null;
  created_at: Date;
  last_used_at: Date | null;
  device_count?: string | number;
}

interface AgentDeviceRow {
  id: number;
  uuid: string;
  hostname: string;
  ip: string | null;
  os_info: unknown;
  agent_version: string | null;
  api_key_id: number | null;
  status: string;
  check_interval_seconds: number;
  approved_by: number | null;
  approved_at: Date | null;
  group_id: number | null;
  created_at: Date;
  updated_at: Date;
}

function rowToApiKey(row: AgentApiKeyRow): AgentApiKey {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    deviceCount: row.device_count ? Number(row.device_count) : undefined,
  };
}

function rowToDevice(row: AgentDeviceRow): AgentDevice {
  return {
    id: row.id,
    uuid: row.uuid,
    hostname: row.hostname,
    ip: row.ip,
    osInfo: typeof row.os_info === 'string' ? JSON.parse(row.os_info) : (row.os_info as AgentDevice['osInfo']),
    agentVersion: row.agent_version,
    apiKeyId: row.api_key_id,
    status: row.status as AgentDevice['status'],
    checkIntervalSeconds: row.check_interval_seconds,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    groupId: row.group_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ============================================================
// Push payload types
// ============================================================

export interface AgentPushPayload {
  hostname: string;
  agentVersion: string;
  osInfo?: {
    platform: string;
    distro?: string | null;
    release?: string | null;
    arch: string;
  };
  metrics: {
    cpu?: { percent: number };
    memory?: { totalMb: number; usedMb: number; percent: number };
    disks?: Array<{ mount: string; totalGb: number; usedGb: number; percent: number }>;
    network?: { inBytesPerSec: number; outBytesPerSec: number };
    loadAvg?: number;
  };
}

export interface AgentPushResponse {
  status: 'ok' | 'pending' | 'unauthorized';
  config?: { checkIntervalSeconds: number };
}

// ============================================================
// Agent Service
// ============================================================

export const agentService = {

  // ── API Keys ────────────────────────────────────────────

  async listKeys(): Promise<AgentApiKey[]> {
    const rows = await db('agent_api_keys as k')
      .leftJoin('agent_devices as d', 'k.id', 'd.api_key_id')
      .groupBy('k.id')
      .select('k.*', db.raw('COUNT(d.id) as device_count'))
      .orderBy('k.created_at', 'desc') as AgentApiKeyRow[];
    return rows.map(rowToApiKey);
  },

  async createKey(name: string, createdBy: number): Promise<AgentApiKey> {
    const [row] = await db('agent_api_keys')
      .insert({ name, created_by: createdBy })
      .returning('*') as AgentApiKeyRow[];
    return rowToApiKey(row);
  },

  async deleteKey(id: number): Promise<boolean> {
    const count = await db('agent_api_keys').where({ id }).del();
    return count > 0;
  },

  // ── Devices ─────────────────────────────────────────────

  async listDevices(status?: AgentDevice['status']): Promise<AgentDevice[]> {
    const query = db('agent_devices').orderBy('created_at', 'desc');
    if (status) query.where({ status });
    const rows = await query as AgentDeviceRow[];
    return rows.map(rowToDevice);
  },

  async getDeviceById(id: number): Promise<AgentDevice | null> {
    const row = await db('agent_devices').where({ id }).first() as AgentDeviceRow | undefined;
    if (!row) return null;
    return rowToDevice(row);
  },

  async getDeviceByUuid(uuid: string): Promise<AgentDevice | null> {
    const row = await db('agent_devices').where({ uuid }).first() as AgentDeviceRow | undefined;
    if (!row) return null;
    return rowToDevice(row);
  },

  async updateDevice(id: number, data: {
    status?: AgentDevice['status'];
    groupId?: number | null;
    checkIntervalSeconds?: number;
    approvedBy?: number;
    approvedAt?: Date;
  }): Promise<AgentDevice | null> {
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (data.status !== undefined) update.status = data.status;
    if (data.groupId !== undefined) update.group_id = data.groupId;
    if (data.checkIntervalSeconds !== undefined) update.check_interval_seconds = data.checkIntervalSeconds;
    if (data.approvedBy !== undefined) update.approved_by = data.approvedBy;
    if (data.approvedAt !== undefined) update.approved_at = data.approvedAt;

    const [row] = await db('agent_devices')
      .where({ id })
      .update(update)
      .returning('*') as AgentDeviceRow[];
    if (!row) return null;
    return rowToDevice(row);
  },

  async deleteDevice(id: number): Promise<boolean> {
    // Delete associated monitors first
    await db('monitors').where({ agent_device_id: id }).del();
    const count = await db('agent_devices').where({ id }).del();
    return count > 0;
  },

  // ── Approval ─────────────────────────────────────────────

  /**
   * Approve a device: set status=approved, create monitors for each metric.
   */
  async approveDevice(
    deviceId: number,
    approvedBy: number,
    groupId: number | null,
  ): Promise<AgentDevice | null> {
    const device = await this.getDeviceById(deviceId);
    if (!device) return null;

    // Update device status
    const updated = await this.updateDevice(deviceId, {
      status: 'approved',
      groupId,
      approvedBy,
      approvedAt: new Date(),
    });

    // Get threshold defaults from group settings (or use hardcoded defaults)
    const cpuThreshold = await this._getGroupThreshold(groupId, 'cpu_percent', 90);
    const memThreshold = await this._getGroupThreshold(groupId, 'memory_percent', 90);
    const diskThreshold = await this._getGroupThreshold(groupId, 'disk_percent', 90);
    const netThreshold = await this._getGroupThreshold(groupId, 'network_bytes', 104857600); // 100 MB/s

    // Create standard monitors
    const monitorsToCreate = [
      {
        name: `${device.hostname} — CPU`,
        metric: 'cpu_percent',
        threshold: cpuThreshold,
        op: '>',
        mount: null,
      },
      {
        name: `${device.hostname} — Memory`,
        metric: 'memory_percent',
        threshold: memThreshold,
        op: '>',
        mount: null,
      },
      {
        name: `${device.hostname} — Net In`,
        metric: 'network_in_bytes',
        threshold: netThreshold,
        op: '>',
        mount: null,
      },
      {
        name: `${device.hostname} — Net Out`,
        metric: 'network_out_bytes',
        threshold: netThreshold,
        op: '>',
        mount: null,
      },
    ];

    // Get disks from the latest push (stored in os_info or last heartbeat)
    // We'll create disk monitors when the first push arrives with disk data
    // For now, create the base monitors
    for (const m of monitorsToCreate) {
      try {
        await db('monitors').insert({
          name: m.name,
          type: 'agent',
          group_id: groupId,
          is_active: true,
          status: 'pending',
          agent_device_id: deviceId,
          agent_metric: m.metric,
          agent_mount: m.mount,
          agent_threshold: m.threshold,
          agent_threshold_op: m.op,
          created_by: approvedBy,
        });
      } catch (error) {
        logger.error(error, `Failed to create monitor "${m.name}" for device ${deviceId}`);
      }
    }

    return updated;
  },

  async _getGroupThreshold(
    groupId: number | null,
    _metricType: string,
    defaultValue: number,
  ): Promise<number> {
    // For now use defaults; later can read from group settings
    return defaultValue;
  },

  // ── Push endpoint logic ───────────────────────────────────

  async handlePush(
    apiKeyId: number,
    deviceUuid: string,
    clientIp: string,
    payload: AgentPushPayload,
  ): Promise<AgentPushResponse> {
    let device = await this.getDeviceByUuid(deviceUuid);

    if (!device) {
      // Register new device as pending
      const [row] = await db('agent_devices')
        .insert({
          uuid: deviceUuid,
          hostname: payload.hostname,
          ip: clientIp,
          os_info: payload.osInfo ? JSON.stringify(payload.osInfo) : null,
          agent_version: payload.agentVersion,
          api_key_id: apiKeyId,
          status: 'pending',
          check_interval_seconds: 300, // pending: check every 5min
        })
        .returning('*') as AgentDeviceRow[];
      device = rowToDevice(row);
    } else {
      // Update device metadata
      await db('agent_devices')
        .where({ id: device.id })
        .update({
          hostname: payload.hostname,
          ip: clientIp,
          agent_version: payload.agentVersion,
          os_info: payload.osInfo ? JSON.stringify(payload.osInfo) : null,
          updated_at: new Date(),
        });

      // Refresh
      device = (await this.getDeviceByUuid(deviceUuid))!;
    }

    // Handle refused devices
    if (device.status === 'refused') {
      return { status: 'unauthorized' };
    }

    // Handle pending devices
    if (device.status === 'pending') {
      return {
        status: 'pending',
        config: { checkIntervalSeconds: device.checkIntervalSeconds },
      };
    }

    // Device is approved → store metrics as heartbeats
    if (device.status === 'approved') {
      await this._storeMetricsAsHeartbeats(device.id, payload);

      // Auto-create disk monitors for new mount points
      if (payload.metrics.disks) {
        await this._ensureDiskMonitors(device, payload.metrics.disks, payload);
      }

      return {
        status: 'ok',
        config: { checkIntervalSeconds: device.checkIntervalSeconds },
      };
    }

    return { status: 'unauthorized' };
  },

  /**
   * Store each metric as a heartbeat for the corresponding monitor.
   */
  async _storeMetricsAsHeartbeats(
    deviceId: number,
    payload: AgentPushPayload,
  ): Promise<void> {
    const monitors = await db('monitors')
      .where({ agent_device_id: deviceId, is_active: true })
      .select('id', 'agent_metric', 'agent_mount', 'agent_threshold', 'agent_threshold_op');

    for (const monitor of monitors) {
      const metric = monitor.agent_metric as string;
      const threshold = monitor.agent_threshold as number | null;
      const op = monitor.agent_threshold_op as string | null;

      let value: number | null = null;
      let message = '';

      switch (metric) {
        case 'cpu_percent':
          value = payload.metrics.cpu?.percent ?? null;
          if (value !== null) message = `CPU: ${value.toFixed(1)}%`;
          break;
        case 'memory_percent':
          value = payload.metrics.memory?.percent ?? null;
          if (value !== null) message = `Memory: ${value.toFixed(1)}%`;
          break;
        case 'disk_percent': {
          const mount = monitor.agent_mount as string;
          const disk = payload.metrics.disks?.find(d => d.mount === mount);
          value = disk?.percent ?? null;
          if (value !== null) message = `Disk ${mount}: ${value.toFixed(1)}%`;
          break;
        }
        case 'network_in_bytes':
          value = payload.metrics.network?.inBytesPerSec ?? null;
          if (value !== null) message = `Net In: ${(value / 1048576).toFixed(2)} MB/s`;
          break;
        case 'network_out_bytes':
          value = payload.metrics.network?.outBytesPerSec ?? null;
          if (value !== null) message = `Net Out: ${(value / 1048576).toFixed(2)} MB/s`;
          break;
        case 'load_avg':
          value = payload.metrics.loadAvg ?? null;
          if (value !== null) message = `Load Avg: ${value.toFixed(2)}`;
          break;
      }

      if (value === null) continue;

      const status = this._evaluateThreshold(value, threshold, op);

      // Record the latest value in static map for AgentMonitorWorker
      AgentMonitorWorker_recordPush(monitor.id as number, value, Date.now());

      await heartbeatService.create({
        monitorId: monitor.id as number,
        status,
        message,
        value: String(value),
      });

      // Update monitor status
      await db('monitors')
        .where({ id: monitor.id })
        .update({ status, updated_at: new Date() });
    }
  },

  /**
   * Create disk monitors for new mount points not yet tracked.
   */
  async _ensureDiskMonitors(
    device: AgentDevice,
    disks: Array<{ mount: string; totalGb: number; usedGb: number; percent: number }>,
    payload: AgentPushPayload,
  ): Promise<void> {
    const existing = await db('monitors')
      .where({ agent_device_id: device.id, agent_metric: 'disk_percent' })
      .select('agent_mount');

    const existingMounts = new Set(existing.map((r: { agent_mount: string }) => r.agent_mount));

    for (const disk of disks) {
      if (!existingMounts.has(disk.mount)) {
        try {
          const diskThreshold = await this._getGroupThreshold(device.groupId, 'disk_percent', 90);
          await db('monitors').insert({
            name: `${device.hostname} — Disk ${disk.mount}`,
            type: 'agent',
            group_id: device.groupId,
            is_active: true,
            status: 'pending',
            agent_device_id: device.id,
            agent_metric: 'disk_percent',
            agent_mount: disk.mount,
            agent_threshold: diskThreshold,
            agent_threshold_op: '>',
            created_by: device.approvedBy,
          });
          logger.info(`Created disk monitor for ${device.hostname}:${disk.mount}`);
        } catch (error) {
          logger.error(error, `Failed to create disk monitor for device ${device.id} mount ${disk.mount}`);
        }
      }
    }
  },

  /**
   * Compare a numeric value against a threshold with the given operator.
   * Returns 'up' if condition is NOT triggered (normal), 'down' if triggered.
   */
  _evaluateThreshold(value: number, threshold: number | null, op: string | null): 'up' | 'down' {
    if (threshold === null || op === null) return 'up';
    switch (op) {
      case '>':  return value > threshold ? 'down' : 'up';
      case '<':  return value < threshold ? 'down' : 'up';
      case '>=': return value >= threshold ? 'down' : 'up';
      case '<=': return value <= threshold ? 'down' : 'up';
      default:   return 'up';
    }
  },

  // ── Version / download endpoints ─────────────────────────

  getAgentVersion(): { version: string; downloadUrl: string } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../../agent/package.json') as { version: string };
    return {
      version: pkg.version,
      downloadUrl: '/api/agent/download/agent.js',
    };
  },
};

// ── Shared state for AgentMonitorWorker ────────────────────
// Map<monitorId, { value: number; timestamp: number }>
export const agentPushData = new Map<number, { value: number; timestamp: number }>();

export function AgentMonitorWorker_recordPush(monitorId: number, value: number, timestamp: number): void {
  agentPushData.set(monitorId, { value, timestamp });
}
