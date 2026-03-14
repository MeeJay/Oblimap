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

interface ObliguardConfig {
  url?: string;
  apiKey?: string;
  ssoSecret?: string;
}

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

  /** Get Obliguard integration config (includes API key — admin only) */
  async getObliguardConfig(): Promise<ObliguardConfig | null> {
    const raw = await this.get(OBLIGUARD_CONFIG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ObliguardConfig;
    } catch {
      return null;
    }
  },

  /** Save Obliguard integration config */
  async setObliguardConfig(cfg: ObliguardConfig): Promise<void> {
    await this.set(OBLIGUARD_CONFIG_KEY, JSON.stringify(cfg));
  },

  // ── Obliview Integration ──────────────────────────────────────────────────

  async getObliviewConfig(): Promise<{ url?: string; apiKey?: string } | null> {
    const raw = await this.get(OBLIVIEW_CONFIG_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as { url?: string; apiKey?: string }; }
    catch { return null; }
  },

  async setObliviewConfig(cfg: { url: string; apiKey: string }): Promise<void> {
    await this.set(OBLIVIEW_CONFIG_KEY, JSON.stringify(cfg));
  },

  // ── Obliance Integration ──────────────────────────────────────────────────

  async getOblianceConfig(): Promise<{ url?: string; apiKey?: string } | null> {
    const raw = await this.get(OBLIANCE_CONFIG_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as { url?: string; apiKey?: string }; }
    catch { return null; }
  },

  async setOblianceConfig(cfg: { url: string; apiKey: string }): Promise<void> {
    await this.set(OBLIANCE_CONFIG_KEY, JSON.stringify(cfg));
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
