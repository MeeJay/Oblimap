import { BaseMonitorWorker, type CheckResult } from './BaseMonitorWorker';
import { agentPushData } from '../services/agent.service';
import { db } from '../db';

/**
 * Agent Monitor Worker (passive).
 *
 * Instead of actively probing a target, this worker:
 * 1. Reads the latest metric value pushed by the agent (from agentPushData map)
 * 2. Checks if the push is recent enough (device online check)
 * 3. Compares the value against the configured threshold
 *
 * The actual heartbeat records are written in real-time by the push endpoint.
 * This worker runs on the configured interval to detect "device offline" state
 * (no push received within 2× check_interval_seconds).
 */
export class AgentMonitorWorker extends BaseMonitorWorker {
  async performCheck(): Promise<CheckResult> {
    const monitorId = this.config.id;
    const agentMetric = this.config.agentMetric as string | null;
    const agentThreshold = this.config.agentThreshold as number | null;
    const agentThresholdOp = this.config.agentThresholdOp as string | null;
    const agentDeviceId = this.config.agentDeviceId as number | null;

    if (!agentMetric) {
      return { status: 'down', message: 'Agent monitor not configured' };
    }

    // Get device check interval for staleness check
    let deviceCheckInterval = this.config.intervalSeconds;
    if (agentDeviceId) {
      const device = await db('agent_devices')
        .where({ id: agentDeviceId })
        .select('check_interval_seconds', 'status')
        .first();

      if (!device) {
        return { status: 'down', message: 'Agent device not found' };
      }

      if (device.status === 'refused') {
        return { status: 'down', message: 'Agent device is refused' };
      }

      if (device.status === 'pending') {
        return { status: 'pending', message: 'Waiting for device approval' };
      }

      deviceCheckInterval = device.check_interval_seconds;
    }

    // Check if we have recent data
    const pushEntry = agentPushData.get(monitorId);
    const maxStaleMs = deviceCheckInterval * 2 * 1000;

    if (!pushEntry) {
      return { status: 'down', message: 'Waiting for first agent push...' };
    }

    const ageMs = Date.now() - pushEntry.timestamp;
    if (ageMs > maxStaleMs) {
      const ageSec = Math.round(ageMs / 1000);
      return {
        status: 'down',
        message: `Device offline: no push for ${ageSec}s (max: ${deviceCheckInterval * 2}s)`,
      };
    }

    // Evaluate threshold
    const value = pushEntry.value;
    const status = this._evaluateThreshold(value, agentThreshold, agentThresholdOp);
    const metricLabel = this._formatMetricValue(agentMetric, value, this.config.agentMount as string | null);

    return {
      status,
      message: metricLabel + (agentThreshold !== null ? ` (threshold: ${this._formatThreshold(agentMetric, agentThreshold, agentThresholdOp)})` : ''),
      value: String(value),
    };
  }

  private _evaluateThreshold(value: number, threshold: number | null, op: string | null): 'up' | 'down' | 'pending' {
    if (threshold === null || op === null) return 'up';
    switch (op) {
      case '>':  return value > threshold ? 'down' : 'up';
      case '<':  return value < threshold ? 'down' : 'up';
      case '>=': return value >= threshold ? 'down' : 'up';
      case '<=': return value <= threshold ? 'down' : 'up';
      default:   return 'up';
    }
  }

  private _formatMetricValue(metric: string, value: number, mount: string | null): string {
    switch (metric) {
      case 'cpu_percent':      return `CPU: ${value.toFixed(1)}%`;
      case 'memory_percent':   return `Memory: ${value.toFixed(1)}%`;
      case 'disk_percent':     return `Disk ${mount ?? ''}: ${value.toFixed(1)}%`;
      case 'network_in_bytes': return `Net In: ${(value / 1048576).toFixed(2)} MB/s`;
      case 'network_out_bytes':return `Net Out: ${(value / 1048576).toFixed(2)} MB/s`;
      case 'load_avg':         return `Load Avg: ${value.toFixed(2)}`;
      default:                 return `${metric}: ${value}`;
    }
  }

  private _formatThreshold(metric: string, threshold: number, op: string | null): string {
    const isBytes = metric === 'network_in_bytes' || metric === 'network_out_bytes';
    const threshStr = isBytes ? `${(threshold / 1048576).toFixed(0)} MB/s` : `${threshold}`;
    return `${op} ${threshStr}`;
  }
}
