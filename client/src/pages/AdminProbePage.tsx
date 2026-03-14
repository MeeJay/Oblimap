import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Radar, Plus, Trash2, CheckCircle, XCircle, Key,
  ChevronDown, RefreshCw, Eye, Copy, AlertCircle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { probeApi } from '../api/probe.api';
import type { Probe, ProbeApiKey } from '@oblimap/shared';
import { clsx } from 'clsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Probe['status'] }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    refused: 'bg-red-500/15 text-red-400 border-red-500/30',
    suspended: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  const label: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    refused: 'Refused',
    suspended: 'Suspended',
  };
  return (
    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded border', map[status] ?? '')}>
      {label[status] ?? status}
    </span>
  );
}

function OnlineDot({ lastSeenAt }: { lastSeenAt: string | null }) {
  if (!lastSeenAt) return <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const online = diff < 5 * 60 * 1000;
  return (
    <span
      className={clsx('w-2 h-2 rounded-full inline-block', online ? 'bg-emerald-500' : 'bg-zinc-600')}
      title={online ? 'Online' : `Last seen: ${new Date(lastSeenAt).toLocaleString()}`}
    />
  );
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── API Key Modal ────────────────────────────────────────────────────────────

function ApiKeyModal({
  onClose,
  tenantKeys,
  onRefresh,
}: {
  onClose: () => void;
  tenantKeys: ProbeApiKey[];
  onRefresh: () => void;
}) {
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
      toast.success('API key created');
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this API key? Any probes using it will stop authenticating.')) return;
    try {
      await probeApi.deleteKey(id);
      onRefresh();
      toast.success('Key deleted');
    } catch {
      toast.error('Failed to delete key');
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => toast.success('Copied!')).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Key size={18} className="text-accent" />
            API Keys
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Key name (e.g. Production)"
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
              Create
            </button>
          </div>

          {newlyCreated && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <p className="text-xs text-emerald-400 font-medium mb-1">
                ✓ Key created — copy it now
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

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tenantKeys.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-4">No API keys yet</p>
            ) : (
              tenantKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 bg-bg-elevated border border-border rounded-lg px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm text-text-primary font-medium">{k.name}</p>
                    <p className="text-xs text-text-muted font-mono">
                      {k.key.slice(0, 8)}••••••••••••••••••••••••••••
                    </p>
                    {k.lastUsedAt && (
                      <p className="text-xs text-text-muted">
                        Last used: {new Date(k.lastUsedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyKey(k.key)}
                      className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                      title="Copy key"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => void handleDelete(k.id)}
                      className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                      title="Delete key"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
                title="Approve"
              >
                <CheckCircle size={15} />
              </button>
              <button
                onClick={() => onRefuse(probe.id)}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Refuse"
              >
                <XCircle size={15} />
              </button>
            </>
          )}
          {probe.status === 'refused' && (
            <button
              onClick={() => onApprove(probe.id)}
              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
              title="Re-approve"
            >
              <CheckCircle size={15} />
            </button>
          )}
          <Link
            to={`/admin/probes/${probe.id}`}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            title="View detail"
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
                    <Trash2 size={14} /> Delete
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
  const [probes, setProbes] = useState<Probe[]>([]);
  const [keys, setKeys] = useState<ProbeApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMenu, setBulkMenu] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const [probeRes, keyRes] = await Promise.all([probeApi.list(), probeApi.listKeys()]);
      setProbes(probeRes.probes);
      setKeys(keyRes.keys);
    } catch {
      toast.error('Failed to load probes');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('Probe approved');
      void load();
    } catch { toast.error('Failed to approve probe'); }
  }

  async function handleRefuse(id: number) {
    if (!confirm('Refuse this probe?')) return;
    try {
      await probeApi.refuse(id);
      toast.success('Probe refused');
      void load();
    } catch { toast.error('Failed to refuse probe'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this probe?')) return;
    try {
      await probeApi.remove(id);
      toast.success('Probe deleted');
      void load();
    } catch { toast.error('Failed to delete probe'); }
  }

  async function handleBulk(action: string) {
    setBulkMenu(false);
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} probe(s)?`)) return;
    try {
      await probeApi.bulk(action, ids);
      toast.success(
        action === 'approve'
          ? `${ids.length} probe(s) approved`
          : action === 'delete'
            ? `${ids.length} probe(s) deleted`
            : `Command queued for ${ids.length} probe(s)`,
      );
      setSelected(new Set());
      void load();
    } catch { toast.error(`Bulk ${action} failed`); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radar size={24} className="text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary">Probes</h1>
          {pendingCount > 0 && (
            <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowKeys(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Key size={14} />
            API Keys ({keys.length})
          </button>
        </div>
      </div>

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
              {s.charAt(0).toUpperCase() + s.slice(1)}
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
            <span className="text-sm text-text-muted">{selected.size} selected</span>
            <div className="relative">
              <button
                onClick={() => setBulkMenu(!bulkMenu)}
                className="btn-secondary flex items-center gap-1 text-sm"
              >
                Actions <ChevronDown size={14} />
              </button>
              {bulkMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBulkMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg py-1 z-20 min-w-[150px]">
                    <button
                      onClick={() => void handleBulk('approve')}
                      className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-bg-elevated flex items-center gap-2"
                    >
                      <CheckCircle size={14} /> Approve all
                    </button>
                    <button
                      onClick={() => void handleBulk('uninstall')}
                      className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Uninstall all
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => void handleBulk('delete')}
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-bg-elevated flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete all
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
            No probes{filterStatus !== 'all' ? ` (${filterStatus})` : ''}
          </p>
          <p className="text-text-muted text-sm">
            {filterStatus === 'all'
              ? 'Install a probe on a network host — it will appear here after its first push.'
              : 'Try a different filter.'}
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
                <th className="px-4 py-3 text-left">Probe</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Platform</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Site</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Last seen</th>
                <th className="px-4 py-3 text-right">Actions</th>
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

      {showKeys && (
        <ApiKeyModal
          onClose={() => setShowKeys(false)}
          tenantKeys={keys}
          onRefresh={() => void load()}
        />
      )}
    </div>
  );
}
