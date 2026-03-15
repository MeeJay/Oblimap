import { db } from '../db';
import type { AppConfig } from '@oblimap/shared';

// Local types for agent config (agent system not in shared for IPAM)
interface AgentGlobalConfig {
  checkIntervalSeconds: number | null;
  heartbeatMonitoring: boolean | null;
  maxMissedPushes: number | null;
  notificationTypes: NotificationTypeConfig | null;
}

interface NotificationTypeConfig {
  global: boolean;
  down: boolean;
  up: boolean;
  alert: boolean;
  update: boolean;
}

/** Public shape returned to clients — never exposes the raw apiKey */
interface IntegrationConfigPublic {
  url: string | null;
  apiKeySet: boolean;
}

type ObliguardConfig = IntegrationConfigPublic;
type ObliviewConfig  = IntegrationConfigPublic;
type OblianceConfig  = IntegrationConfigPublic;

const DEFAULT_NOTIFICATION_TYPES: NotificationTypeConfig = {
  global: true,
  down: true,
  up: true,
  alert: true,
  update: true,
};

const AGENT_GLOBAL_CONFIG_KEY = 'agent_global_config';
const OBLIGUARD_CONFIG_KEY  = 'obliguard_config';
const OBLIVIEW_CONFIG_KEY   = 'obliview_config';
const OBLIANCE_CONFIG_KEY   = 'obliance_config';

export const appConfigService = {
  async get(key: string): Promise<string | null> {
    const row = await db('app_config').where({ key }).first('value');
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await db('app_config')
      .insert({ key, value })
      .onConflict('key')
      .merge({ value });
  },

  async getAll(): Promise<AppConfig> {
    const rows = await db('app_config').select('key', 'value');
    const map = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));

    // Parse integration URLs (but NOT the apiKeys — never expose those via getAll)
    const parseUrl = (key: string): string | null => {
      if (!map[key]) return null;
      try { return (JSON.parse(map[key]) as { url?: string }).url || null; }
      catch { return null; }
    };

    return {
      allow_2fa: map['allow_2fa'] === 'true',
      force_2fa: map['force_2fa'] === 'true',
      otp_smtp_server_id: map['otp_smtp_server_id'] ? parseInt(map['otp_smtp_server_id'], 10) : null,
      obliguardUrl: parseUrl(OBLIGUARD_CONFIG_KEY),
      obliviewUrl:  parseUrl(OBLIVIEW_CONFIG_KEY),
      oblianceUrl:  parseUrl(OBLIANCE_CONFIG_KEY),
      enable_foreign_sso:  map['enable_foreign_sso']  === 'true',
      enable_obliview_sso: map['enable_obliview_sso'] === 'true',
      enable_obliance_sso: map['enable_obliance_sso'] === 'true',
    };
  },

  /** Get Obliguard integration config — returns public shape (no raw key) */
  async getObliguardConfig(): Promise<ObliguardConfig> {
    const raw = await this.get(OBLIGUARD_CONFIG_KEY);
    if (!raw) return { url: null, apiKeySet: false };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKeySet: !!cfg.apiKey };
    } catch {
      return { url: null, apiKeySet: false };
    }
  },

  /** Get Obliguard integration config raw (includes API key — for internal use only) */
  async getObliguardRaw(): Promise<{ url: string | null; apiKey: string | null }> {
    const raw = await this.get(OBLIGUARD_CONFIG_KEY);
    if (!raw) return { url: null, apiKey: null };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKey: cfg.apiKey ?? null };
    } catch {
      return { url: null, apiKey: null };
    }
  },

  /** Patch Obliguard integration config (partial update) */
  async patchObliguardConfig(patch: { url?: string | null; apiKey?: string | null }): Promise<ObliguardConfig> {
    const existing = await this.getObliguardRaw();
    const merged = {
      url: 'url' in patch ? (patch.url ?? null) : existing.url,
      apiKey: ('apiKey' in patch && patch.apiKey) ? patch.apiKey : existing.apiKey,
    };
    await this.set(OBLIGUARD_CONFIG_KEY, JSON.stringify(merged));
    return { url: merged.url, apiKeySet: !!merged.apiKey };
  },

  // ── Obliview Integration ──────────────────────────────────────────────────

  async getObliviewConfig(): Promise<ObliviewConfig> {
    const raw = await this.get(OBLIVIEW_CONFIG_KEY);
    if (!raw) return { url: null, apiKeySet: false };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKeySet: !!cfg.apiKey };
    } catch {
      return { url: null, apiKeySet: false };
    }
  },

  async getObliviewRaw(): Promise<{ url: string | null; apiKey: string | null }> {
    const raw = await this.get(OBLIVIEW_CONFIG_KEY);
    if (!raw) return { url: null, apiKey: null };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKey: cfg.apiKey ?? null };
    } catch {
      return { url: null, apiKey: null };
    }
  },

  async patchObliviewConfig(patch: { url?: string | null; apiKey?: string | null }): Promise<ObliviewConfig> {
    const existing = await this.getObliviewRaw();
    const merged = {
      url: 'url' in patch ? (patch.url ?? null) : existing.url,
      apiKey: ('apiKey' in patch && patch.apiKey) ? patch.apiKey : existing.apiKey,
    };
    await this.set(OBLIVIEW_CONFIG_KEY, JSON.stringify(merged));
    return { url: merged.url, apiKeySet: !!merged.apiKey };
  },

  // ── Obliance Integration ──────────────────────────────────────────────────

  async getOblianceConfig(): Promise<OblianceConfig> {
    const raw = await this.get(OBLIANCE_CONFIG_KEY);
    if (!raw) return { url: null, apiKeySet: false };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKeySet: !!cfg.apiKey };
    } catch {
      return { url: null, apiKeySet: false };
    }
  },

  async getOblianceRaw(): Promise<{ url: string | null; apiKey: string | null }> {
    const raw = await this.get(OBLIANCE_CONFIG_KEY);
    if (!raw) return { url: null, apiKey: null };
    try {
      const cfg = JSON.parse(raw) as { url?: string; apiKey?: string };
      return { url: cfg.url ?? null, apiKey: cfg.apiKey ?? null };
    } catch {
      return { url: null, apiKey: null };
    }
  },

  async patchOblianceConfig(patch: { url?: string | null; apiKey?: string | null }): Promise<OblianceConfig> {
    const existing = await this.getOblianceRaw();
    const merged = {
      url: 'url' in patch ? (patch.url ?? null) : existing.url,
      apiKey: ('apiKey' in patch && patch.apiKey) ? patch.apiKey : existing.apiKey,
    };
    await this.set(OBLIANCE_CONFIG_KEY, JSON.stringify(merged));
    return { url: merged.url, apiKeySet: !!merged.apiKey };
  },

  /** Get global agent defaults from app_config */
  async getAgentGlobal(): Promise<AgentGlobalConfig> {
    const raw = await this.get(AGENT_GLOBAL_CONFIG_KEY);
    if (!raw) {
      return {
        checkIntervalSeconds: null,
        heartbeatMonitoring: null,
        maxMissedPushes: null,
        notificationTypes: null,
      };
    }
    try {
      return JSON.parse(raw) as AgentGlobalConfig;
    } catch {
      return {
        checkIntervalSeconds: null,
        heartbeatMonitoring: null,
        maxMissedPushes: null,
        notificationTypes: null,
      };
    }
  },

  /** Merge-patch global agent defaults */
  async setAgentGlobal(patch: Partial<AgentGlobalConfig>): Promise<AgentGlobalConfig> {
    const current = await this.getAgentGlobal();
    const updated: AgentGlobalConfig = { ...current, ...patch };
    await this.set(AGENT_GLOBAL_CONFIG_KEY, JSON.stringify(updated));
    return updated;
  },

  /**
   * Read the global notification types (fully resolved — each field falls back to
   * DEFAULT_NOTIFICATION_TYPES when null).
   */
  async getResolvedAgentNotificationTypes(): Promise<{
    global: boolean; down: boolean; up: boolean; alert: boolean; update: boolean;
  }> {
    const cfg = await this.getAgentGlobal();
    const nt: NotificationTypeConfig | null = cfg.notificationTypes ?? null;
    return {
      global: nt?.global ?? DEFAULT_NOTIFICATION_TYPES.global,
      down:   nt?.down   ?? DEFAULT_NOTIFICATION_TYPES.down,
      up:     nt?.up     ?? DEFAULT_NOTIFICATION_TYPES.up,
      alert:  nt?.alert  ?? DEFAULT_NOTIFICATION_TYPES.alert,
      update: nt?.update ?? DEFAULT_NOTIFICATION_TYPES.update,
    };
  },
};
