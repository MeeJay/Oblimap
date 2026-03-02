import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, X, ArrowDown, ArrowUp, AlertTriangle, Loader2 } from 'lucide-react';
import type {
  RemediationAction,
  RemediationBinding,
  ResolvedRemediationBinding,
  RemediationTrigger,
  OverrideModeR,
} from '@obliview/shared';
import { remediationApi } from '../../api/remediation.api';
import { cn } from '../../utils/cn';
import toast from 'react-hot-toast';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<'global' | 'group' | 'monitor', { label: string; className: string }> = {
  global:  { label: 'Global',  className: 'bg-blue-500/10 text-blue-400' },
  group:   { label: 'Group',   className: 'bg-purple-500/10 text-purple-400' },
  monitor: { label: 'Monitor', className: 'bg-green-500/10 text-green-400' },
};

const TRIGGER_LABELS: Record<RemediationTrigger, string> = {
  down: 'On DOWN',
  up:   'On UP',
  both: 'On both',
};

const OVERRIDE_LABELS: Record<OverrideModeR, string> = {
  merge:   'Merge',
  replace: 'Replace',
  exclude: 'Exclude',
};

const ACTION_TYPE_SHORT: Record<string, string> = {
  webhook: 'Webhook',
  n8n:     'N8N',
  script:  'Script',
  docker_restart: 'Docker',
  ssh:     'SSH',
};

// ─── ResolvedEntry type (server returns extra source fields) ───────────────────

type ResolvedEntry = ResolvedRemediationBinding & {
  source: 'global' | 'group' | 'monitor';
  sourceId: number | null;
  isDirect: boolean;
};

// ─── Add Binding Modal ────────────────────────────────────────────────────────

function AddBindingModal({
  actions,
  onAdd,
  onClose,
}: {
  actions: RemediationAction[];
  onAdd: (actionId: number, triggerOn: RemediationTrigger, overrideMode: OverrideModeR, cooldownSeconds: number) => Promise<unknown>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(actions[0]?.id ?? null);
  const [triggerOn, setTriggerOn]   = useState<RemediationTrigger>('down');
  const [overrideMode, setMode]     = useState<OverrideModeR>('merge');
  const [cooldown, setCooldown]     = useState(300);
  const [saving, setSaving]         = useState(false);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await onAdd(selectedId, triggerOn, overrideMode, cooldown);
      onClose();
    } catch {
      toast.error('Failed to add binding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-primary shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Add Remediation Binding</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Action selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Action</label>
            <select value={selectedId ?? ''} onChange={e => setSelectedId(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
              {actions.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACTION_TYPE_SHORT[a.type] ?? a.type})
                </option>
              ))}
            </select>
            {actions.length === 0 && (
              <p className="text-xs text-text-muted mt-1">No actions — create one in Admin → Remediations</p>
            )}
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Trigger</label>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(['down', 'up', 'both'] as RemediationTrigger[]).map(t => (
                <button key={t} type="button" onClick={() => setTriggerOn(t)}
                  className={cn('flex-1 py-1.5 font-medium transition-colors',
                    triggerOn === t ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover')}>
                  {TRIGGER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Override mode */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Override Mode</label>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(['merge', 'replace', 'exclude'] as OverrideModeR[]).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={cn('flex-1 py-1.5 font-medium transition-colors',
                    overrideMode === m ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover')}>
                  {OVERRIDE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Cooldown */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Cooldown (seconds)</label>
            <input type="number" min={0} max={86400} value={cooldown}
              onChange={e => setCooldown(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
            <p className="text-xs text-text-muted mt-1">Minimum time between executions (0 = no cooldown)</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:bg-bg-hover transition-colors">
            Cancel
          </button>
          <button onClick={() => void handleSave()} disabled={saving || !selectedId}
            className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-60 transition-colors flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add Binding
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function RemediationBindingsPanel({
  scope,
  scopeId,
  groupId,
  title,
}: {
  scope: 'group' | 'monitor';
  scopeId: number;
  groupId?: number | null;
  title?: string;
}) {
  const [resolved, setResolved]   = useState<ResolvedEntry[]>([]);
  const [allActions, setAllActions] = useState<RemediationAction[]>([]);
  const [directMap, setDirectMap] = useState<Map<number, RemediationBinding>>(new Map());
  const [overrideMode, setOverrideMode] = useState<'merge' | 'replace'>('merge');
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [res, acts] = await Promise.all([
        remediationApi.getResolved(scope, scopeId, groupId),
        remediationApi.listActions(),
      ]);
      setResolved(res as ResolvedEntry[]);
      setAllActions(acts);

      // Build direct bindings map from scope bindings
      const direct = await remediationApi.getBindings(scope, scopeId);
      const map = new Map(direct.map(b => [b.actionId, b]));
      setDirectMap(map);

      // Detect current override mode from direct non-exclude bindings
      const replaceBinding = direct.find(b => b.overrideMode === 'replace');
      setOverrideMode(replaceBinding ? 'replace' : 'merge');
    } catch {
      toast.error('Failed to load remediation bindings');
    } finally {
      setLoading(false);
    }
  }, [scope, scopeId, groupId]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (
    actionId: number,
    triggerOn: RemediationTrigger,
    ovMode: OverrideModeR,
    cooldownSeconds: number,
  ) => {
    const binding = await remediationApi.addBinding({
      actionId,
      scope,
      scopeId,
      overrideMode: ovMode,
      triggerOn,
      cooldownSeconds,
    });
    await load();
    toast.success('Binding added');
    return binding;
  };

  const handleRemoveDirect = async (actionId: number) => {
    const b = directMap.get(actionId);
    if (!b) return;
    await remediationApi.deleteBinding(b.id);
    await load();
    toast.success('Binding removed');
  };

  const handleExclude = async (actionId: number) => {
    // Exclude an inherited action by adding an 'exclude' binding at this scope
    await remediationApi.addBinding({
      actionId, scope, scopeId, overrideMode: 'exclude',
      triggerOn: 'both', cooldownSeconds: 0,
    });
    await load();
    toast.success('Action excluded at this scope');
  };

  const handleToggleOverrideMode = async () => {
    const newMode: OverrideModeR = overrideMode === 'merge' ? 'replace' : 'merge';
    // Update all direct non-exclude bindings to the new mode
    const updates = Array.from(directMap.values()).filter(b => b.overrideMode !== 'exclude');
    await Promise.all(updates.map(b => remediationApi.updateBinding(b.id, { overrideMode: newMode })));
    await load();
    setOverrideMode(newMode);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary p-5">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading remediations…
        </div>
      </div>
    );
  }

  const hasDirectNonExclude = Array.from(directMap.values()).some(b => b.overrideMode !== 'exclude');

  // Build display list: all known actions + their status from resolved
  const resolvedByActionId = new Map(resolved.map(r => [r.actionId, r]));

  // Collect all action IDs we know about (from resolved + direct)
  const allActionIds = new Set([
    ...resolved.map(r => r.actionId),
    ...Array.from(directMap.keys()),
  ]);
  const allActionsById = new Map(allActions.map(a => [a.id, a]));

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-1.5">
          <ShieldCheck size={12} /> {title ?? 'Remediations'}
        </h3>
        <div className="flex items-center gap-2">
          {hasDirectNonExclude && (
            <button type="button" onClick={() => void handleToggleOverrideMode()}
              className={cn(
                'text-xs px-2 py-1 rounded-lg border font-medium transition-colors',
                overrideMode === 'replace'
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  : 'border-border text-text-muted hover:bg-bg-hover',
              )}
              title={overrideMode === 'replace'
                ? 'Replace mode: parent bindings are ignored. Click to switch to Merge'
                : 'Merge mode: adds to parent bindings. Click to switch to Replace'}>
              {overrideMode === 'replace' ? 'Replace' : 'Merge'}
            </button>
          )}
          <button type="button" onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border text-text-secondary hover:bg-bg-hover transition-colors">
            <Plus size={11} /> Bind
          </button>
        </div>
      </div>

      {overrideMode === 'replace' && (
        <div className="flex items-start gap-2 mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-2.5 text-xs text-orange-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Replace mode active — inherited bindings from parent scopes are ignored.
        </div>
      )}

      {/* Binding list */}
      {allActionIds.size === 0 ? (
        <div className="text-center py-6 text-text-muted text-sm">
          <ShieldCheck size={24} className="mx-auto mb-2 opacity-30" />
          No remediations configured
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {Array.from(allActionIds).map(actionId => {
            const resolvedEntry = resolvedByActionId.get(actionId);
            const directBinding = directMap.get(actionId);
            const action = resolvedEntry?.action ?? allActionsById.get(actionId);
            if (!action) return null;

            const isExcluded  = directBinding?.overrideMode === 'exclude';
            const isDirect    = !!directBinding && !isExcluded;
            const isInherited = !directBinding && !!resolvedEntry;

            return (
              <div key={actionId} className={cn(
                'flex items-center gap-3 py-2.5',
                isExcluded && 'opacity-50',
              )}>
                {/* Status icon */}
                <span className={cn(
                  'shrink-0',
                  isDirect    ? 'text-accent'       :
                  isExcluded  ? 'text-orange-400'   :
                  isInherited ? 'text-text-muted'   : 'text-text-muted',
                )}>
                  <ShieldCheck size={13} />
                </span>

                {/* Action info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm text-text-primary">{action.name}</span>
                    <span className="text-[10px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded-full">
                      {ACTION_TYPE_SHORT[action.type] ?? action.type}
                    </span>
                    {/* Source badge — show for all resolved entries */}
                    {resolvedEntry && (() => {
                      const badge = SOURCE_BADGE[resolvedEntry.source];
                      return badge ? (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', badge.className)}>
                          {badge.label}
                        </span>
                      ) : null;
                    })()}
                    {isExcluded && (
                      <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">Excluded</span>
                    )}
                  </div>
                  {/* Trigger + cooldown info */}
                  {(isDirect || isInherited) && resolvedEntry && (
                    <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5">
                      {resolvedEntry.triggerOn === 'down' && <span className="flex items-center gap-0.5"><ArrowDown size={9} /> DOWN</span>}
                      {resolvedEntry.triggerOn === 'up'   && <span className="flex items-center gap-0.5"><ArrowUp size={9} /> UP</span>}
                      {resolvedEntry.triggerOn === 'both' && <span>DOWN + UP</span>}
                      {resolvedEntry.cooldownSeconds > 0 && (
                        <span>• {resolvedEntry.cooldownSeconds}s cooldown</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isDirect && (
                    <button onClick={() => void handleRemoveDirect(actionId)}
                      className="p-1 rounded text-text-muted hover:text-status-down hover:bg-status-down/10 transition-colors"
                      title="Remove direct binding">
                      <X size={12} />
                    </button>
                  )}
                  {isInherited && !isExcluded && (
                    <button onClick={() => void handleExclude(actionId)}
                      className="text-xs px-2 py-0.5 rounded border border-border text-text-muted hover:bg-bg-hover transition-colors"
                      title="Exclude at this scope (unbind)">
                      Unbind
                    </button>
                  )}
                  {isExcluded && (
                    <button onClick={() => void handleRemoveDirect(actionId)}
                      className="text-xs px-2 py-0.5 rounded border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-colors"
                      title="Remove exclusion (re-inherit)">
                      Re-inherit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add binding modal */}
      {showAdd && (
        <AddBindingModal
          actions={allActions.filter(a => a.enabled)}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

export default RemediationBindingsPanel;
