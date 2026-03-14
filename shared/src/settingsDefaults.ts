// IPAM-specific settings keys and defaults

export type SettingsKey =
  | 'scanIntervalSeconds'
  | 'maxMissedPushes'
  | 'offlineThresholdMultiplier'
  | 'notificationEnabled';

export const SETTINGS_KEYS: SettingsKey[] = [
  'scanIntervalSeconds',
  'maxMissedPushes',
  'offlineThresholdMultiplier',
  'notificationEnabled',
];

export const SETTINGS_DEFAULTS: Record<SettingsKey, string | number | boolean> = {
  scanIntervalSeconds: 300,        // 5 minutes
  maxMissedPushes: 3,
  offlineThresholdMultiplier: 2,
  notificationEnabled: true,
};

// Alias for backwards compat
export const HARDCODED_DEFAULTS = SETTINGS_DEFAULTS;

export interface SettingDefinition {
  key: SettingsKey;
  label: string;
  type: 'number' | 'boolean';
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  description?: string;
  unit?: string;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  { key: 'scanIntervalSeconds', label: 'Scan Interval (seconds)', type: 'number', defaultValue: 300, min: 60, max: 86400 },
  { key: 'maxMissedPushes', label: 'Max Missed Pushes', type: 'number', defaultValue: 3, min: 1, max: 20 },
  { key: 'offlineThresholdMultiplier', label: 'Offline Threshold Multiplier', type: 'number', defaultValue: 2, min: 1, max: 10 },
  { key: 'notificationEnabled', label: 'Notifications Enabled', type: 'boolean', defaultValue: true },
];
