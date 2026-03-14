import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, GripVertical, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { VendorTypeRule, DeviceType } from '@oblimap/shared';
import { vendorRulesApi } from '@/api/vendorRules.api';
import { Button } from '@/components/common/Button';
import { cn } from '@/utils/cn';

// ── Editable row ─────────────────────────────────────────────────────────────

interface EditRowProps {
  rule: VendorTypeRule;
  onSave: (id: number, patch: Partial<Pick<VendorTypeRule, 'vendorPattern' | 'deviceType' | 'label' | 'priority'>>) => Promise<void>;
  onCancel: () => void;
  onDelete: (id: number) => Promise<void>;
  saving: boolean;
}

function EditRow({ rule, onSave, onCancel, onDelete, saving }: EditRowProps) {
  const { t } = useTranslation();

  const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
    { value: 'router',      label: t('deviceTypes.router')      },
    { value: 'switch',      label: t('deviceTypes.switch')      },
    { value: 'server',      label: t('deviceTypes.server')      },
    { value: 'printer',     label: t('deviceTypes.printer')     },
    { value: 'iot',         label: t('deviceTypes.iot')         },
    { value: 'camera',      label: t('deviceTypes.camera')      },
    { value: 'counter',     label: t('deviceTypes.counter')     },
    { value: 'workstation', label: t('deviceTypes.workstation') },
    { value: 'phone',       label: t('deviceTypes.phone')       },
    { value: 'ap',          label: t('deviceTypes.ap')          },
    { value: 'firewall',    label: t('deviceTypes.firewall')    },
    { value: 'nas',         label: t('deviceTypes.nas')         },
    { value: 'unknown',     label: t('deviceTypes.unknown')     },
  ];

  const [pattern, setPattern] = useState(rule.vendorPattern);
  const [deviceType, setDeviceType] = useState<DeviceType>(rule.deviceType);
  const [label, setLabel] = useState(rule.label ?? '');
  const [priority, setPriority] = useState(String(rule.priority));

  const submit = () =>
    onSave(rule.id, {
      vendorPattern: pattern,
      deviceType,
      label: label || null,
      priority: parseInt(priority, 10) || 0,
    });

  return (
    <tr className="bg-bg-elevated/30">
      <td className="px-3 py-2">
        <input
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={t('vendorRules.editPatternPlaceholder')}
        />
      </td>
      <td className="px-3 py-2">
        <select
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value as DeviceType)}
        >
          {DEVICE_TYPES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('vendorRules.editLabelPlaceholder')}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          className="w-16 rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          min={0}
          max={999}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={submit}
            disabled={saving || !pattern.trim()}
            className="flex h-7 w-7 items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
            title={t('common.save')}
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-hover"
            title={t('common.cancel')}
          >
            <X size={14} />
          </button>
          <button
            onClick={() => void onDelete(rule.id)}
            disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            title={t('common.delete')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add row ───────────────────────────────────────────────────────────────────

interface AddRowProps {
  groupId: number;
  onAdd: (rule: VendorTypeRule) => void;
}

function AddRow({ groupId, onAdd }: AddRowProps) {
  const { t } = useTranslation();

  const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
    { value: 'router',      label: t('deviceTypes.router')      },
    { value: 'switch',      label: t('deviceTypes.switch')      },
    { value: 'server',      label: t('deviceTypes.server')      },
    { value: 'printer',     label: t('deviceTypes.printer')     },
    { value: 'iot',         label: t('deviceTypes.iot')         },
    { value: 'camera',      label: t('deviceTypes.camera')      },
    { value: 'counter',     label: t('deviceTypes.counter')     },
    { value: 'workstation', label: t('deviceTypes.workstation') },
    { value: 'phone',       label: t('deviceTypes.phone')       },
    { value: 'ap',          label: t('deviceTypes.ap')          },
    { value: 'firewall',    label: t('deviceTypes.firewall')    },
    { value: 'nas',         label: t('deviceTypes.nas')         },
    { value: 'unknown',     label: t('deviceTypes.unknown')     },
  ];

  const [pattern, setPattern]       = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType>('unknown');
  const [label, setLabel]           = useState('');
  const [priority, setPriority]     = useState('0');
  const [saving, setSaving]         = useState(false);

  const submit = async () => {
    if (!pattern.trim()) return;
    setSaving(true);
    try {
      const { rule } = await vendorRulesApi.create({
        vendorPattern: pattern.trim(),
        deviceType,
        label: label.trim() || null,
        priority: parseInt(priority, 10) || 0,
        groupId,
      });
      onAdd(rule);
      setPattern('');
      setLabel('');
      setPriority('0');
      setDeviceType('unknown');
      toast.success(t('vendorRules.ruleAdded'));
    } catch {
      toast.error(t('vendorRules.failedAdd'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-t border-border bg-bg-secondary/50">
      <td className="px-3 py-2">
        <input
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={t('vendorRules.patternPlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </td>
      <td className="px-3 py-2">
        <select
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value as DeviceType)}
        >
          {DEVICE_TYPES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('vendorRules.labelPlaceholder')}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          className="w-16 rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          min={0}
          max={999}
        />
      </td>
      <td className="px-3 py-2">
        <Button size="sm" onClick={submit} loading={saving} disabled={!pattern.trim()}>
          <Plus size={13} />
          {t('vendorRules.addBtn')}
        </Button>
      </td>
    </tr>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface VendorRulesPanelProps {
  groupId: number;
}

export function VendorRulesPanel({ groupId }: VendorRulesPanelProps) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<VendorTypeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Device type label helper (translated)
  const deviceTypeLabel = useCallback((type: DeviceType): string => {
    const key = `deviceTypes.${type}` as const;
    const val = t(key);
    return val !== key ? val : type;
  }, [t]);

  const load = useCallback(async () => {
    try {
      const { rules: r } = await vendorRulesApi.list(groupId);
      setRules(r);
    } catch {
      toast.error(t('vendorRules.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async (
    id: number,
    patch: Partial<Pick<VendorTypeRule, 'vendorPattern' | 'deviceType' | 'label' | 'priority'>>,
  ) => {
    setSaving(true);
    try {
      const { rule } = await vendorRulesApi.update(id, patch);
      setRules((prev) => prev.map((r) => (r.id === id ? rule : r)));
      setEditingId(null);
      toast.success(t('vendorRules.ruleUpdated'));
    } catch {
      toast.error(t('vendorRules.failedUpdate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    try {
      await vendorRulesApi.remove(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) setEditingId(null);
      toast.success(t('vendorRules.ruleDeleted'));
    } catch {
      toast.error(t('vendorRules.failedDelete'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Tag size={14} className="text-accent shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t('vendorRules.title')}</h3>
          <p className="text-xs text-text-muted mt-0.5">{t('vendorRules.description')}</p>
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-text-muted">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                <th className="px-3 py-2 w-48">{t('vendorRules.colVendorPattern')}</th>
                <th className="px-3 py-2 w-36">{t('vendorRules.colDeviceType')}</th>
                <th className="px-3 py-2">{t('vendorRules.colLabelOverride')}</th>
                <th className="px-3 py-2 w-20">{t('vendorRules.colPriority')}</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-text-muted text-xs">
                    {t('vendorRules.noRules')}
                  </td>
                </tr>
              )}
              {rules.map((rule) =>
                editingId === rule.id ? (
                  <EditRow
                    key={rule.id}
                    rule={rule}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    onDelete={handleDelete}
                    saving={saving}
                  />
                ) : (
                  <tr
                    key={rule.id}
                    className={cn('group hover:bg-bg-elevated/50 transition-colors', saving && editingId === rule.id && 'opacity-50')}
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <GripVertical size={12} className="text-text-muted opacity-0 group-hover:opacity-100" />
                        <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">
                          {rule.vendorPattern}
                        </code>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {deviceTypeLabel(rule.deviceType)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs">
                      {rule.label ?? <span className="text-text-muted italic">—</span>}
                    </td>
                    <td className="px-3 py-2 text-text-muted text-xs">{rule.priority}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setEditingId(rule.id)}
                        className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('common.edit')}
                      >
                        <Edit2 size={13} />
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {/* Add row always visible at bottom */}
              <AddRow
                groupId={groupId}
                onAdd={(rule) => setRules((prev) => [...prev, rule].sort((a, b) => b.priority - a.priority || a.id - b.id))}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
