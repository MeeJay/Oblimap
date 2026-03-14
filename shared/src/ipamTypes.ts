// IPAM-specific enums and constants

export type UserRole = 'admin' | 'user';

export const DEVICE_TYPES = [
  'router', 'switch', 'server', 'printer', 'iot', 'camera',
  'counter', 'workstation', 'phone', 'ap', 'firewall', 'nas', 'unknown',
] as const;

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  router: 'Router',
  switch: 'Switch',
  server: 'Server',
  printer: 'Printer',
  iot: 'IoT Device',
  camera: 'IP Camera',
  counter: 'People Counter',
  workstation: 'Workstation',
  phone: 'VoIP Phone',
  ap: 'Access Point',
  firewall: 'Firewall',
  nas: 'NAS / Storage',
  unknown: 'Unknown',
};

export const DEVICE_TYPE_ICONS: Record<string, string> = {
  router: 'router',
  switch: 'network',
  server: 'server',
  printer: 'printer',
  iot: 'cpu',
  camera: 'camera',
  counter: 'users',
  workstation: 'monitor',
  phone: 'phone',
  ap: 'wifi',
  firewall: 'shield',
  nas: 'hard-drive',
  unknown: 'help-circle',
};
