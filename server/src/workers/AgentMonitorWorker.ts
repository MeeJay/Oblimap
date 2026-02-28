import { BaseMonitorWorker, type CheckResult } from './BaseMonitorWorker';
import { agentPushData } from '../services/agent.service';
import { db } from '../db';

/**
 * Agent Monitor Worker (passive).
 *
 * Thresholds are evaluated in real-time at push time (in agent.service.ts).
 * This worker's only job is to detect "device offline" (no push received
 * within 2 × check_interval_seconds) and return the current status.
 */
export class AgentMonitorWorker extends BaseMonitorWorker {
  async performCheck(): Promise<CheckResult> {
    const agentDeviceId = this.config.agentDeviceId as number | null;

    if (!agentDeviceId) {
      return { status: 'down', message: 'Agent monitor not configured (no device ID)' };
    }

    // Fetch device for status + check interval + heartbeat_monitoring
    const device = await db('agent_devices')
      .where({ id: agentDeviceId })
      .select('check_interval_seconds', 'status', 'heartbeat_monitoring')
      .first() as { check_interval_seconds: number; status: string; heartbeat_monitoring: boolean } | undefined;

    if (!device) {
      return { status: 'down', message: 'Agent device not found' };
    }

    if (device.status === 'refused') {
      return { status: 'down', message: 'Agent device is refused' };
    }

    if (device.status === 'suspended') {
      return { status: 'paused', message: 'Agent device is suspended' };
    }

    if (device.status === 'pending') {
      return { status: 'pending', message: 'Waiting for device approval' };
    }

    // Check for a recent push
    const snapshot = agentPushData.get(agentDeviceId);
    const maxStaleMs = device.check_interval_seconds * 2 * 1000;

    if (!snapshot) {
      // No push received yet
      if (!device.heartbeat_monitoring) {
        return { status: 'inactive', message: 'No data received (heartbeat monitoring disabled)' };
      }
      return { status: 'down', message: 'Waiting for first agent push...' };
    }

    const ageMs = Date.now() - snapshot.receivedAt.getTime();
    if (ageMs > maxStaleMs) {
      const ageSec = Math.round(ageMs / 1000);
      const ageMins = Math.floor(ageSec / 60);
      const timeLabel = ageMins > 0 ? `${ageMins}m ${ageSec % 60}s` : `${ageSec}s`;

      // heartbeat_monitoring = false → grey inactive (no notification)
      if (!device.heartbeat_monitoring) {
        return {
          status: 'inactive',
          message: `No data received for ${timeLabel} (heartbeat monitoring disabled)`,
        };
      }

      return {
        status: 'down',
        message: `Device offline (last seen ${timeLabel} ago)`,
      };
    }

    // Return the current status calculated at push time
    const message = snapshot.violations.length > 0
      ? snapshot.violations.join('; ')
      : 'All metrics OK';

    return {
      status: snapshot.overallStatus,
      message,
    };
  }
}
