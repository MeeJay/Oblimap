// Socket.io event names for Oblimap

export const SOCKET_EVENTS = {
  // Probe events
  PROBE_PUSH: 'PROBE_PUSH',                          // probe sent new scan data
  PROBE_STATUS_CHANGED: 'PROBE_STATUS_CHANGED',       // probe went online/offline
  PROBE_APPROVED: 'PROBE_APPROVED',                   // probe was approved
  PROBE_DEVICE_UPDATED: 'PROBE_DEVICE_UPDATED',
  PROBE_DEVICE_DELETED: 'PROBE_DEVICE_DELETED',

  // Site events
  SITE_UPDATED: 'SITE_UPDATED',                       // site config changed
  SITE_DELETED: 'SITE_DELETED',

  // Item events
  ITEM_STATUS_CHANGED: 'ITEM_STATUS_CHANGED',         // device went online/offline
  NEW_DEVICE_DISCOVERED: 'NEW_DEVICE_DISCOVERED',     // new device found on network
  DEVICE_IP_CHANGED: 'DEVICE_IP_CHANGED',             // MAC moved to new IP
  IP_CONFLICT_DETECTED: 'IP_CONFLICT_DETECTED',       // IP instability alert

  // Group events
  GROUP_CREATED: 'GROUP_CREATED',
  GROUP_UPDATED: 'GROUP_UPDATED',
  GROUP_DELETED: 'GROUP_DELETED',
  GROUP_MOVED: 'GROUP_MOVED',

  // Agent compat aliases
  AGENT_STATUS_CHANGED: 'PROBE_STATUS_CHANGED',
  AGENT_DEVICE_UPDATED: 'PROBE_DEVICE_UPDATED',
  AGENT_DEVICE_DELETED: 'PROBE_DEVICE_DELETED',

  // Notification events
  NOTIFICATION_NEW: 'NOTIFICATION_NEW',               // new live alert
  NOTIFICATION_READ: 'NOTIFICATION_READ',

  // System events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
