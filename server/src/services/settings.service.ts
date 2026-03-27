import { db } from '../db';
import type { SettingsScope, ResolvedSettings, SettingValue } from '@oblimap/shared';
import type { SettingsKey } from '@oblimap/shared';
import { SETTINGS_KEYS, HARDCODED_DEFAULTS, SETTINGS_DEFINITIONS } from '@oblimap/shared';

interface SettingsRow {
  id: number;
  scope: string;
  scope_id: number | null;
  key: string;
  value: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface SettingOverride {
  key: SettingsKey;
  value: unknown;
}

export const settingsService = {
  // ── Raw CRUD ──

  async getByScope(scope: SettingsScope, scopeId: number | null): Promise<Record<string, unknown>> {
    const rows = await db<SettingsRow>('settings')
      .where({ scope, scope_id: scopeId })
      .select('key', 'value');

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      let val: unknown = row.value;
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      }
      result[row.key] = val;
    }
    return result;
  },

  async set(scope: SettingsScope, scopeId: number | null, key: SettingsKey, value: unknown): Promise<void> {
    const def = SETTINGS_DEFINITIONS.find((d: typeof SETTINGS_DEFINITIONS[0]) => d.key === key);
    if (!def) throw new Error(`Unknown setting key: ${key}`);
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) {
        throw new Error(`Value for ${key} must be between ${def.min} and ${def.max}`);
      }
      if (def.max !== undefined && value > def.max) {
        throw new Error(`Value for ${key} must be between ${def.min} and ${def.max}`);
      }
    }

    const serialized = Array.isArray(value) ? JSON.stringify(value) : JSON.stringify(value);

    await db('settings')
      .insert({
        scope,
        scope_id: scopeId,
        key,
        value: serialized,
        updated_at: new Date(),
      })
      .onConflict(['scope', 'scope_id', 'key'])
      .merge({ value: serialized, updated_at: new Date() });
  },

  async remove(scope: SettingsScope, scopeId: number | null, key: SettingsKey): Promise<boolean> {
    const count = await db('settings')
      .where({ scope, scope_id: scopeId, key })
      .del();
    return count > 0;
  },

  async setBulk(scope: SettingsScope, scopeId: number | null, overrides: SettingOverride[]): Promise<void> {
    for (const { key, value } of overrides) {
      await this.set(scope, scopeId, key, value);
    }
  },

  // ── Inheritance Resolution ──

  /**
   * Resolve all settings for a given scope, walking up the hierarchy:
   *   Hardcoded defaults → Global → Group ancestors (root→leaf) → Monitor
   *
   * Each resolved value tracks its source for UI display.
   */
  async resolveForMonitor(monitorId: number, groupId: number | null): Promise<ResolvedSettings> {
    // 1. Start with hardcoded defaults
    const resolved: ResolvedSettings = {} as ResolvedSettings;
    const allKeys = SETTINGS_KEYS;

    for (const key of allKeys) {
      resolved[key] = {
        value: HARDCODED_DEFAULTS[key],
        source: 'default',
        sourceId: null,
        sourceName: 'Default',
      };
    }

    // 2. Apply global overrides
    const globalOverrides = await this.getByScope('global', null);
    for (const key of allKeys) {
      if (globalOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: globalOverrides[key as string] as any,
          source: 'global',
          sourceId: null,
          sourceName: 'Global',
        };
      }
    }

    // 3. Apply group chain (root → leaf) if monitor is in a group
    if (groupId !== null) {
      // Get ancestors ordered by depth DESC (root first → direct parent last)
      const ancestorRows = await db('group_closure')
        .join('monitor_groups', 'monitor_groups.id', 'group_closure.ancestor_id')
        .where('group_closure.descendant_id', groupId)
        .orderBy('group_closure.depth', 'desc')
        .select('monitor_groups.id', 'monitor_groups.name', 'group_closure.depth');

      for (const ancestor of ancestorRows) {
        const groupOverrides = await this.getByScope('group', ancestor.id);
        for (const key of allKeys) {
          if (groupOverrides[key as string] !== undefined) {
            resolved[key] = {
              value: groupOverrides[key as string] as any,
              source: 'group',
              sourceId: ancestor.id,
              sourceName: ancestor.name,
            };
          }
        }
      }
    }

    // 4. Apply monitor-level overrides
    const monitorOverrides = await this.getByScope('monitor', monitorId);
    for (const key of allKeys) {
      if (monitorOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: monitorOverrides[key as string] as any,
          source: 'monitor',
          sourceId: monitorId,
          sourceName: 'This monitor',
        };
      }
    }

    return resolved;
  },

  /**
   * Resolve settings for a group level (for display in group settings UI).
   * Chain: Hardcoded → Global → Ancestor groups (root→parent)
   * Does NOT include the group's own overrides as resolved — returns them separately.
   */
  async resolveForGroup(groupId: number): Promise<{ resolved: ResolvedSettings; overrides: Record<string, unknown> }> {
    const allKeys = SETTINGS_KEYS;

    // 1. Start with hardcoded defaults
    const resolved: ResolvedSettings = {} as ResolvedSettings;
    for (const key of allKeys) {
      resolved[key] = {
        value: HARDCODED_DEFAULTS[key],
        source: 'default',
        sourceId: null,
        sourceName: 'Default',
      };
    }

    // 2. Global
    const globalOverrides = await this.getByScope('global', null);
    for (const key of allKeys) {
      if (globalOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: globalOverrides[key as string] as any,
          source: 'global',
          sourceId: null,
          sourceName: 'Global',
        };
      }
    }

    // 3. Ancestors (root→parent, excluding self)
    const ancestorRows = await db('group_closure')
      .join('monitor_groups', 'monitor_groups.id', 'group_closure.ancestor_id')
      .where('group_closure.descendant_id', groupId)
      .where('group_closure.depth', '>', 0) // exclude self
      .orderBy('group_closure.depth', 'desc')
      .select('monitor_groups.id', 'monitor_groups.name', 'group_closure.depth');

    for (const ancestor of ancestorRows) {
      const groupOvr = await this.getByScope('group', ancestor.id);
      for (const key of allKeys) {
        if (groupOvr[key as string] !== undefined) {
          resolved[key] = {
            value: groupOvr[key as string] as any,
            source: 'group',
            sourceId: ancestor.id,
            sourceName: ancestor.name,
          };
        }
      }
    }

    // 4. Get this group's own overrides (separate, not merged into resolved)
    const overrides = await this.getByScope('group', groupId);

    return { resolved, overrides };
  },

  /**
   * Resolve for global scope (just hardcoded defaults + global overrides)
   */
  async resolveGlobal(): Promise<{ resolved: ResolvedSettings; overrides: Record<string, unknown> }> {
    const allKeys = SETTINGS_KEYS;
    const resolved: ResolvedSettings = {} as ResolvedSettings;

    for (const key of allKeys) {
      resolved[key] = {
        value: HARDCODED_DEFAULTS[key],
        source: 'default',
        sourceId: null,
        sourceName: 'Default',
      };
    }

    const overrides = await this.getByScope('global', null);

    return { resolved, overrides };
  },

  async resolveForSite(tenantId: number, siteId: number): Promise<ResolvedSettings> {
    const allKeys = SETTINGS_KEYS;

    const site = await db('sites').where({ id: siteId, tenant_id: tenantId }).first('group_id');

    const resolved: ResolvedSettings = {} as ResolvedSettings;
    for (const key of allKeys) {
      resolved[key] = {
        value: HARDCODED_DEFAULTS[key],
        source: 'default',
        sourceId: null,
        sourceName: 'Default',
      };
    }

    const globalOverrides = await this.getByScope('global', null);
    for (const key of allKeys) {
      if (globalOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: globalOverrides[key as string] as any,
          source: 'global',
          sourceId: null,
          sourceName: 'Global',
        };
      }
    }

    if (site?.group_id) {
      const ancestorRows = await db('group_closure')
        .join('monitor_groups', 'monitor_groups.id', 'group_closure.ancestor_id')
        .where('group_closure.descendant_id', site.group_id)
        .orderBy('group_closure.depth', 'desc')
        .select('monitor_groups.id', 'monitor_groups.name', 'group_closure.depth');

      for (const ancestor of ancestorRows) {
        const groupOverrides = await this.getByScope('group', ancestor.id);
        for (const key of allKeys) {
          if (groupOverrides[key as string] !== undefined) {
            resolved[key] = {
              value: groupOverrides[key as string] as any,
              source: 'group',
              sourceId: ancestor.id,
              sourceName: ancestor.name,
            };
          }
        }
      }
    }

    const siteOverrides = await this.getByScope('site', siteId);
    for (const key of allKeys) {
      if (siteOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: siteOverrides[key as string] as any,
          source: 'site',
          sourceId: siteId,
          sourceName: 'This site',
        };
      }
    }

    return resolved;
  },

  async resolveForProbe(tenantId: number, probeId: number, siteId: number | null, groupId: number | null): Promise<ResolvedSettings> {
    const allKeys = SETTINGS_KEYS;

    const resolved: ResolvedSettings = {} as ResolvedSettings;
    for (const key of allKeys) {
      resolved[key] = {
        value: HARDCODED_DEFAULTS[key],
        source: 'default',
        sourceId: null,
        sourceName: 'Default',
      };
    }

    const globalOverrides = await this.getByScope('global', null);
    for (const key of allKeys) {
      if (globalOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: globalOverrides[key as string] as any,
          source: 'global',
          sourceId: null,
          sourceName: 'Global',
        };
      }
    }

    if (groupId !== null) {
      const ancestorRows = await db('group_closure')
        .join('monitor_groups', 'monitor_groups.id', 'group_closure.ancestor_id')
        .where('group_closure.descendant_id', groupId)
        .orderBy('group_closure.depth', 'desc')
        .select('monitor_groups.id', 'monitor_groups.name', 'group_closure.depth');

      for (const ancestor of ancestorRows) {
        const groupOverrides = await this.getByScope('group', ancestor.id);
        for (const key of allKeys) {
          if (groupOverrides[key as string] !== undefined) {
            resolved[key] = {
              value: groupOverrides[key as string] as any,
              source: 'group',
              sourceId: ancestor.id,
              sourceName: ancestor.name,
            };
          }
        }
      }
    }

    if (siteId !== null) {
      const siteOverrides = await this.getByScope('site', siteId);
      for (const key of allKeys) {
        if (siteOverrides[key as string] !== undefined) {
          resolved[key] = {
            value: siteOverrides[key as string] as any,
            source: 'site',
            sourceId: siteId,
            sourceName: 'This site',
          };
        }
      }
    }

    const monitorOverrides = await this.getByScope('monitor', probeId);
    for (const key of allKeys) {
      if (monitorOverrides[key as string] !== undefined) {
        resolved[key] = {
          value: monitorOverrides[key as string] as any,
          source: 'monitor',
          sourceId: probeId,
          sourceName: 'This probe',
        };
      }
    }

    return resolved;
  },
};
