/**
 * AdminVendorRulesPage — manage vendor → device type auto-assignment rules.
 *
 * When a probe discovers a device, it looks up the vendor (OUI prefix).
 * These rules match vendor names to device types so that, for example,
 * "Hikvision" → camera, "Aruba" → ap, etc.
 *
 * Rules are evaluated in descending priority order; first match wins.
 */

import { useState, useEffect, useCallback } from 'react';
import { Shuffle, Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import type { VendorTypeRule, DeviceType } from '@oblimap/shared';
import { vendorRulesApi } from '@/api/vendorRules.api';
import { cn } from '@/utils/cn';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_TYPES: { value: DeviceType; label: string; color: string }[] = [
  { value: 'unknown',     label: 'Unknown',     color: 'text-zinc-400   bg-zinc-500/10   border-zinc-500/30'   },
  { value: 'router',      label: 'Router',      color: 'text-blue-400   bg-blue-500/10   border-blue-500/30'   },
  { value: 'switch',      label: 'Switch',      color: 'text-sky-400    bg-sky-500/10    border-sky-500/30'    },
  { value: 'server',      label: 'Server',      color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { value: 'workstation', label: 'Workstation', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  { value: 'printer',     label: 'Printer',     color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { value: 'iot',         label: 'IoT',         color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { value: 'camera',      label: 'Camera',      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  { value: 'counter',     label: 'Counter',     color: 'text-teal-400   bg-teal-500/10   border-teal-500/30'   },
  { value: 'phone',       label: 'Phone',          color: 'text-pink-400   bg-pink-500/10   border-pink-500/30'   },
  { value: 'gsm',        label: 'GSM / Mobile',   color: 'text-rose-400   bg-rose-500/10   border-rose-500/30'   },
  { value: 'laptop',     label: 'Laptop',          color: 'text-blue-300   bg-blue-400/10   border-blue-400/30'   },
  { value: 'vm',         label: 'Virtual Machine', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { value: 'ap',          label: 'Access Point',   color: 'text-cyan-400  bg-cyan-500/10   border-cyan-500/30'   },
  { value: 'firewall',    label: 'Firewall',    color: 'text-red-400    bg-red-500/10    border-red-500/30'    },
  { value: 'nas',         label: 'NAS',         color: 'text-amber-400  bg-amber-500/10  border-amber-500/30'  },
];

function typeMeta(t: DeviceType) {
  return DEVICE_TYPES.find(d => d.value === t) ?? DEVICE_TYPES[0];
}

function TypeBadge({ type }: { type: DeviceType }) {
  const meta = typeMeta(type);
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded border', meta.color)}>
      {meta.label}
    </span>
  );
}

// ─── Inline-edit row ──────────────────────────────────────────────────────────

function EditRow({
  rule,
  onSaved,
  onCancel,
}: {
  rule: VendorTypeRule;
  onSaved: (updated: VendorTypeRule) => void;
  onCancel: () => void;
}) {
  const [pattern, setPattern] = useState(rule.vendorPattern);
  const [type, setType] = useState<DeviceType>(rule.deviceType);
  const [label, setLabel] = useState(rule.label ?? '');
  const [priority, setPriority] = useState(String(rule.priority));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!pattern.trim()) { toast.error('Vendor pattern is required'); return; }
    setSaving(true);
    try {
      const { rule: updated } = await vendorRulesApi.update(rule.id, {
        vendorPattern: pattern.trim(),
        deviceType: type,
        label: label.trim() || null,
        priority: parseInt(priority) || 0,
      });
      onSaved(updated);
      toast.success('Rule updated');
    } catch {
      toast.error('Failed to update rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-accent/5 border-b border-border">
      <td className="px-4 py-2">
        <input
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          placeholder="e.g. Hikvision"
          className="w-full text-sm bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </td>
      <td className="px-4 py-2">
        <select
          value={type}
          onChange={e => setType(e.target.value as DeviceType)}
          className="text-sm bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {DEVICE_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </td>
      <td className="px-4 py-2 hidden lg:table-cell">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Optional label"
          className="w-full text-sm bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </td>
      <td className="px-4 py-2 hidden md:table-cell">
        <input
          type="number"
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="w-20 text-sm bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="p-1.5 text-emerald-400 hover:text-emerald-300 rounded transition-colors disabled:opacity-50"
            title="Save"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── New rule form ─────────────────────────────────────────────────────────────

function AddRuleForm({ onCreated }: { onCreated: (rule: VendorTypeRule) => void }) {
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<DeviceType>('unknown');
  const [label, setLabel] = useState('');
  const [priority, setPriority] = useState('0');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) { toast.error('Vendor pattern is required'); return; }
    setSaving(true);
    try {
      const { rule } = await vendorRulesApi.create({
        vendorPattern: pattern.trim(),
        deviceType: type,
        label: label.trim() || null,
        priority: parseInt(priority) || 0,
      });
      onCreated(rule);
      setPattern(''); setLabel(''); setPriority('0'); setType('unknown');
      setOpen(false);
      toast.success('Rule created');
    } catch {
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-dashed border-border text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors"
      >
        <Plus size={14} />
        Add rule
      </button>
    );
  }

  return (
    <form onSubmit={e => void submit(e)} className="flex flex-wrap items-end gap-2 p-4 bg-bg-elevated border border-border rounded-lg">
      <div className="flex flex-col gap-1 min-w-[180px] flex-1">
        <label className="text-xs text-text-muted">Vendor pattern <span className="text-red-400">*</span></label>
        <input
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          placeholder="e.g. Hikvision"
          autoFocus
          className="text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-muted">Device type</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as DeviceType)}
          className="text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {DEVICE_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-[140px] flex-1">
        <label className="text-xs text-text-muted">Label <span className="text-text-muted text-[10px]">(optional)</span></label>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Custom display label"
          className="text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="flex flex-col gap-1 w-24">
        <label className="text-xs text-text-muted">Priority</label>
        <input
          type="number"
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:bg-bg-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminVendorRulesPage() {
  const [rules, setRules] = useState<VendorTypeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rules: r } = await vendorRulesApi.list();
      setRules(r);
    } catch {
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: number) {
    try {
      await vendorRulesApi.remove(id);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  }

  async function adjustPriority(rule: VendorTypeRule, delta: number) {
    const newPriority = rule.priority + delta;
    try {
      const { rule: updated } = await vendorRulesApi.update(rule.id, { priority: newPriority });
      setRules(prev =>
        prev
          .map(r => r.id === rule.id ? updated : r)
          .sort((a, b) => b.priority - a.priority || a.id - b.id),
      );
    } catch {
      toast.error('Failed to update priority');
    }
  }

  const filtered = rules.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.vendorPattern.toLowerCase().includes(q) ||
      r.deviceType.toLowerCase().includes(q) ||
      (r.label ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shuffle size={20} className="text-accent" />
            <h1 className="text-xl font-semibold text-text-primary">Vendor Rules</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Map vendor name patterns to device types. Rules are applied in descending priority order — the first match wins.
          </p>
        </div>
        <div className="text-sm text-text-muted bg-bg-elevated border border-border rounded-lg px-3 py-2">
          <span className="font-semibold text-text-primary">{rules.length}</span> rule{rules.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Add rule form */}
      <AddRuleForm
        onCreated={rule => {
          setRules(prev =>
            [...prev, rule].sort((a, b) => b.priority - a.priority || a.id - b.id),
          );
        }}
      />

      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search pattern, type or label…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm text-sm bg-bg-secondary border border-border rounded-md px-3 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-muted text-sm">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Shuffle size={32} className="text-text-muted opacity-40" />
            <p className="text-sm text-text-muted">
              {search ? 'No rules match your search.' : 'No vendor rules yet. Add one above.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-elevated">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide">
                  Vendor pattern
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide">
                  Device type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell">
                  Label
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">
                  Priority
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(rule => {
                if (editingId === rule.id) {
                  return (
                    <EditRow
                      key={rule.id}
                      rule={rule}
                      onSaved={updated => {
                        setRules(prev =>
                          prev
                            .map(r => r.id === rule.id ? updated : r)
                            .sort((a, b) => b.priority - a.priority || a.id - b.id),
                        );
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  );
                }
                return (
                  <tr
                    key={rule.id}
                    className="border-b border-border last:border-0 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-text-primary">{rule.vendorPattern}</span>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={rule.deviceType} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-text-secondary">{rule.label ?? <span className="text-text-muted">—</span>}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <span className="text-text-secondary tabular-nums w-6">{rule.priority}</span>
                        <div className="flex flex-col">
                          <button
                            onClick={() => void adjustPriority(rule, 10)}
                            className="text-text-muted hover:text-text-primary transition-colors"
                            title="Increase priority"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            onClick={() => void adjustPriority(rule, -10)}
                            className="text-text-muted hover:text-text-primary transition-colors"
                            title="Decrease priority"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingId(rule.id)}
                          className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => void handleDelete(rule.id)}
                          className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-border bg-bg-elevated p-4 text-sm text-text-secondary space-y-1">
        <p className="font-medium text-text-primary mb-2">How vendor rules work</p>
        <p>• When a probe discovers a new device, it looks up the OUI vendor from the MAC prefix.</p>
        <p>• Each rule is checked in descending priority order. The <strong>first</strong> rule whose pattern appears in the vendor name is applied.</p>
        <p>• Pattern matching is case-insensitive substring match (e.g. <code className="bg-bg-tertiary rounded px-1">hikvision</code> matches <em>"Hangzhou Hikvision Digital Technology"</em>).</p>
        <p>• If no rule matches, the device type defaults to <span className="inline-flex items-center gap-1 text-zinc-400 bg-zinc-500/10 border border-zinc-500/30 rounded px-1.5 text-xs">Unknown</span>.</p>
      </div>
    </div>
  );
}
