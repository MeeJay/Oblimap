/**
 * monitors.api.ts — stub file.
 * The monitors API has been removed as part of the Oblimap IPAM conversion.
 * This stub exists solely to prevent compile errors in pages that have not yet
 * been updated (AgentDetailPage, GroupDetailPage, AdminUsersPage).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notImplemented = (..._args: any[]): never => {
  throw new Error('monitors.api is not implemented in Oblimap');
};

export const monitorsApi = {
  list: notImplemented,
  getById: notImplemented,
  create: notImplemented,
  update: notImplemented,
  delete: notImplemented,
  pause: notImplemented,
  getSummary: notImplemented,
  getHeartbeatsByPeriod: notImplemented,
  getHeartbeats: notImplemented,
};
