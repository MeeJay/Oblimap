export const SETTINGS_KEYS = {
  CHECK_INTERVAL: 'check_interval',
  RETRY_INTERVAL: 'retry_interval',
  MAX_RETRIES: 'max_retries',
  TIMEOUT: 'timeout',
  NOTIFICATION_COOLDOWN: 'notification_cooldown',
  HEARTBEAT_RETENTION_DAYS: 'heartbeat_retention_days',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export interface SettingDefinition {
  key: SettingsKey;
  label: string;
  description: string;
  type: 'number';
  unit: string;
  default: number;
  min: number;
  max: number;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  {
    key: SETTINGS_KEYS.CHECK_INTERVAL,
    label: 'Check Interval',
    description: 'How often to perform checks',
    type: 'number',
    unit: 'seconds',
    default: 60,
    min: 1,
    max: 86400,
  },
  {
    key: SETTINGS_KEYS.RETRY_INTERVAL,
    label: 'Retry Interval',
    description: 'Interval between retries on failure',
    type: 'number',
    unit: 'seconds',
    default: 20,
    min: 1,
    max: 3600,
  },
  {
    key: SETTINGS_KEYS.MAX_RETRIES,
    label: 'Max Retries',
    description: 'Number of retries before marking as DOWN',
    type: 'number',
    unit: 'retries',
    default: 3,
    min: 0,
    max: 20,
  },
  {
    key: SETTINGS_KEYS.TIMEOUT,
    label: 'Timeout',
    description: 'Check timeout duration',
    type: 'number',
    unit: 'ms',
    default: 5000,
    min: 1000,
    max: 60000,
  },
  {
    key: SETTINGS_KEYS.NOTIFICATION_COOLDOWN,
    label: 'Notification Cooldown',
    description: 'Minimum time between repeated notifications',
    type: 'number',
    unit: 'seconds',
    default: 300,
    min: 0,
    max: 86400,
  },
  {
    key: SETTINGS_KEYS.HEARTBEAT_RETENTION_DAYS,
    label: 'Heartbeat Retention',
    description: 'How long to keep heartbeat data',
    type: 'number',
    unit: 'days',
    default: 365,
    min: 1,
    max: 3650,
  },
];

export const HARDCODED_DEFAULTS: Record<SettingsKey, number> = {
  [SETTINGS_KEYS.CHECK_INTERVAL]: 60,
  [SETTINGS_KEYS.RETRY_INTERVAL]: 20,
  [SETTINGS_KEYS.MAX_RETRIES]: 3,
  [SETTINGS_KEYS.TIMEOUT]: 5000,
  [SETTINGS_KEYS.NOTIFICATION_COOLDOWN]: 300,
  [SETTINGS_KEYS.HEARTBEAT_RETENTION_DAYS]: 365,
};
