import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Radar, Plus, Trash2, CheckCircle, XCircle, Key,
  ChevronDown, RefreshCw, Eye, Copy, AlertCircle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { probeApi } from '../api/probe.api';
import type { Probe, ProbeApiKey } from '@oblimap/shared';
import { clsx } from 'clsx';
import { useUiStore } from '@/store/uiStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Probe['status'] }) {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    pending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    approved:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    refused:   'bg-red-500/15 text-red-400 border-red-500/30',
    suspended: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  const labelMap: Record<string, string> = {
    pending:   t('probesPage.statusPending'),
    approved:  t('probesPage.statusApproved'),
    refused:   t('probesPage.statusRefused'),
    suspended: t('probesPage.statusSuspended'),
  };
  return (
    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded border', map[status] ?? '')}>
      {labelMap[status] ?? status}
    </span>
  );
}

function OnlineDot({ lastSeenAt }: { lastSeenAt: string | null }) {
  const { t } = useTranslation();
  if (!lastSeenAt) return <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const online = diff < 5 * 60 * 1000;
  return (
    <span
      className={clsx('w-2 h-2 rounded-full inline-block', online ? 'bg-emerald-500' : 'bg-zinc-600')}
      title={online ? t('probesPage.statusApproved') : `${t('probesPage.colLastSeen')}: ${new Date(lastSeenAt).toLocaleString()}`}
    />
  );
}

function formatLastSeen(ts: string | null) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab({
  keys,
  onRefresh,
}: {
  keys: ProbeApiKey[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<ProbeApiKey | null>(null);

  async function handleCreate() {
    const name = newKeyName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { key } = await probeApi.createKey(name);
      setNewlyCreated(key);
      setNewKeyName('');
      onRefresh();
      toast.success(t('probesPage.apiKeys.created'));
    } catch {
      toast.error(t('probesPage.apiKeys.failedCreate'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('probesPage.apiKeys.confirmDelete'))) return;
    try {
      await probeApi.deleteKey(id);
      onRefresh();
      toast.success(t('probesPage.apiKeys.deleted') ?? t('common.success'));
    } catch {
      toast.error(t('probesPage.apiKeys.failedDelete'));
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
      .then(() => toast.success(t('probesPage.apiKeys.copied')))
      .catch(() => undefined);
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Create form */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-text-primary mb-3">{t('probesPage.apiKeys.create')}</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('probesPage.apiKeys.namePlaceholder')}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newKeyName.trim()}
            className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('probesPage.apiKeys.create')}
          </button>
        </div>

        {newlyCreated && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <p className="text-xs text-emerald-400 font-medium mb-1">
              {t('probesPage.apiKeys.keyCreated')}
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-text-primary flex-1 break-all">{newlyCreated.key}</code>
              <button
                onClick={() => copyKey(newlyCreated.key)}
                className="text-accent hover:text-accent-hover p-1"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keys list */}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {keys.length === 0 ? (
          <div className="p-8 text-center">
            <Key size={28} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">{t('probesPage.apiKeys.noKeys')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-text-primary font-medium">{k.name}</p>
                  <p className="text-xs text-text-muted font-mono">
                    {k.key.slice(0, 8)}••••••••••••••••••••••••••••
                  </p>
                  {k.lastUsedAt && (
                    <p className="text-xs text-text-muted">
                      {t('probesPage.apiKeys.lastUsed', { date: new Date(k.lastUsedAt).toLocaleString() })}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyKey(k.key)}
                    className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                    title={t('probesPage.apiKeys.copyKey')}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(k.id)}
                    className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                    title={t('probesPage.apiKeys.deleteKey')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Probe Row ────────────────────────────────────────────────────────────────

function ProbeRow({
  probe,
  selected,
  onToggle,
  onApprove,
  onRefuse,
  onDelete,
}: {
  probe: Probe;
  selected: boolean;
  onToggle: () => void;
  onApprove: (id: number) => void;
  onRefuse: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const platform = probe.osInfo?.platform
    ? String(probe.osInfo.platform).charAt(0).toUpperCase() + String(probe.osInfo.platform).slice(1)
    : '—';
  const arch = probe.osInfo?.arch ? ` (${String(probe.osInfo.arch)})` : '';

  return (
    <tr className="border-b border-border last:border-0 hover:bg-bg-elevated/50 transition-colors">
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-accent" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <OnlineDot lastSeenAt={probe.lastSeenAt} />
          <div>
            <Link
              to={`/admin/probes/${probe.id}`}
              className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
            >
              {probe.name ?? probe.hostname}
            </Link>
            <p className="text-xs text-text-muted font-mono">{probe.uuid.slice(0, 8)}…</p>
          </div>
        </div>
        {probe.pendingCommand && (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-400 mt-0.5">
            <AlertCircle size={10} /> {probe.pendingCommand} queued
          </span>
        )}
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-sm text-text-secondary">{platform}{arch}</span>
        {probe.probeVersion && (
          <p className="text-xs text-text-muted">v{probe.probeVersion}</p>
        )}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-sm text-text-secondary">
          {probe.siteId ? `Site #${probe.siteId}` : '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={probe.status} />
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="text-sm text-text-secondary">{formatLastSeen(probe.lastSeenAt)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {probe.status === 'pending' && (
            <>
              <button
                onClick={() => onApprove(probe.id)}
                className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                title={t('probesPage.detail.approve')}
              >
                <CheckCircle size={15} />
              </button>
              <button
                onClick={() => onRefuse(probe.id)}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title={t('probesPage.detail.refuse')}
              >
                <XCircle size={15} />
              </button>
            </>
          )}
          {probe.status === 'refused' && (
            <button
              onClick={() => onApprove(probe.id)}
              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
              title={t('probesPage.detail.reApprove')}
            >
              <CheckCircle size={15} />
            </button>
          )}
          <Link
            to={`/admin/probes/${probe.id}`}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            title={t('common.edit')}
          >
            <Eye size={15} />
          </Link>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            >
              <ChevronDown size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(probe.id); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bg-elevated flex items-center gap-2"
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AdminProbePage() {
  const { t } = useTranslation();
  const { openAddProbeModal } = useUiStore();
  const [activeTab, setActiveTab] = useState<'probes' | 'keys'>('probes');
  const [probes, setProbes] = useState<Probe[]>([]);
  const [keys, setKeys] = useState<ProbeApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMenu, setBulkMenu] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const [probeRes, keyRes] = await Promise.all([probeApi.list(), probeApi.listKeys()]);
      setProbes(probeRes.probes);
      setKeys(keyRes.keys);
    } catch {
      toast.error(t('probesPage.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = probes.filter((p) => filterStatus === 'all' || p.status === filterStatus);
  const pendingCount = probes.filter((p) => p.status === 'pending').length;
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleApprove(id: number) {
    try {
      await probeApi.approve(id);
      toast.success(t('probesPage.approved'));
      void load();
    } catch { toast.error(t('probesPage.failedApprove')); }
  }

  async function handleRefuse(id: number) {
    if (!confirm(t('probesPage.confirmRefuse'))) return;
    try {
      await probeApi.refuse(id);
      toast.success(t('probesPage.refused'));
      void load();
    } catch { toast.error(t('probesPage.failedRefuse')); }
  }

  async function handleDelete(id: number) {
    if (!confirm(t('probesPage.confirmDelete'))) return;
    try {
      await probeApi.remove(id);
      toast.success(t('probesPage.deleted'));
      void load();
    } catch { toast.error(t('probesPage.failedDelete')); }
  }

  async function handleBulk(action: string) {
    setBulkMenu(false);
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === 'delete' && !confirm(t('probesPage.confirmBulkDelete', { count: ids.length }))) return;
    try {
      await probeApi.bulk(action, ids);
      toast.success(
        action === 'approve'
          ? t('probesPage.bulkApproved', { count: ids.length })
          : action === 'delete'
            ? t('probesPage.bulkDeleted', { count: ids.length })
            : t('probesPage.bulkCommandQueued', { count: ids.length }),
      );
      setSelected(new Set());
      void load();
    } catch { toast.error(t('probesPage.bulkFailed', { action })); }
  }

  const filterLabels: Record<string, string> = {
    all:      t('probesPage.filterAll'),
    pending:  t('probesPage.statusPending'),
    approved: t('probesPage.statusApproved'),
    refused:  t('probesPage.statusRefused'),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radar size={24} className="text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary">{t('probesPage.title')}</h1>
          {pendingCount > 0 && (
            <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount} {t('probesPage.statusPending').toLowerCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
            title={t('common.refresh')}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={openAddProbeModal}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} />
            {t('probesPage.addProbe')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        <button
          onClick={() => setActiveTab('probes')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
            activeTab === 'probes'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-secondary',
          )}
        >
          {t('probesPage.tabDevices')}
          <span className={clsx(
            'text-xs rounded-full px-1.5 py-0.5 font-semibold',
            activeTab === 'probes' ? 'bg-accent/20 text-accent' : 'bg-bg-elevated text-text-muted',
          )}>
            {probes.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('keys')}
          className={clsx(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
            activeTab === 'keys'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-secondary',
          )}
        >
          <Key size={14} />
          {t('probesPage.tabApiKeys')}
          <span className={clsx(
            'text-xs rounded-full px-1.5 py-0.5 font-semibold',
            activeTab === 'keys' ? 'bg-accent/20 text-accent' : 'bg-bg-elevated text-text-muted',
          )}>
            {keys.length}
          </span>
        </button>
      </div>

      {/* Probes tab */}
      {activeTab === 'probes' && (
        <>
          {/* Filter + bulk toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {['all', 'pending', 'approved', 'refused'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    filterStatus === s
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated',
                  )}
                >
                  {filterLabels[s] ?? s}
                  {s === 'pending' && pendingCount > 0 && (
                    <span className="ml-1.5 bg-yellow-500 text-black text-xs rounded-full px-1.5">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {selected.size > 0 && (
              <div className="relative flex items-center gap-2">
                <span className="text-sm text-text-muted">
                  {t('probesPage.selected', { count: selected.size })}
                </span>
                <div className="relative">
                  <button
                    onClick={() => setBulkMenu(!bulkMenu)}
                    className="btn-secondary flex items-center gap-1 text-sm"
                  >
                    {t('probesPage.actions')} <ChevronDown size={14} />
                  </button>
                  {bulkMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setBulkMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg py-1 z-20 min-w-[150px]">
                        <button
                          onClick={() => void handleBulk('approve')}
                          className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-bg-elevated flex items-center gap-2"
                        >
                          <CheckCircle size={14} /> {t('probesPage.approveAll')}
                        </button>
                        <button
                          onClick={() => void handleBulk('uninstall')}
                          className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated flex items-center gap-2"
                        >
                          <Trash2 size={14} /> {t('probesPage.uninstallAll')}
                        </button>
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => void handleBulk('delete')}
                          className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bg-elevated flex items-center gap-2"
                        >
                          <Trash2 size={14} /> {t('probesPage.deleteAll')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
              <Radar size={40} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium mb-1">
                {filterStatus !== 'all'
                  ? t('probesPage.noProbesFiltered', { status: filterStatus })
                  : t('probesPage.noProbes')}
              </p>
              <p className="text-text-muted text-sm">
                {filterStatus === 'all'
                  ? t('probesPage.noProbesDesc')
                  : t('probesPage.tryFilter')}
              </p>
            </div>
          ) : (
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="accent-accent"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">{t('probesPage.colProbe')}</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">{t('probesPage.colPlatform')}</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">{t('probesPage.colSite')}</th>
                    <th className="px-4 py-3 text-left">{t('probesPage.colStatus')}</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">{t('probesPage.colLastSeen')}</th>
                    <th className="px-4 py-3 text-right">{t('probesPage.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((probe) => (
                    <ProbeRow
                      key={probe.id}
                      probe={probe}
                      selected={selected.has(probe.id)}
                      onToggle={() => toggleOne(probe.id)}
                      onApprove={handleApprove}
                      onRefuse={handleRefuse}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* API Keys tab */}
      {activeTab === 'keys' && (
        <ApiKeysTab keys={keys} onRefresh={() => void load()} />
      )}
    </div>
  );
}
