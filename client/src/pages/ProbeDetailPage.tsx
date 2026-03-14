import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Radar, ArrowLeft, CheckCircle, XCircle, Trash2, Plus,
  X, Save, Loader2, AlertTriangle, Monitor, RefreshCw,
  Activity, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { probeApi } from '../api/probe.api';
import type { Probe, ProbeScanConfig } from '@oblimap/shared';
import { clsx } from 'clsx';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Probe['status'] }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Pending Approval' },
    approved: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Approved' },
    refused: { cls: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'Refused' },
    suspended: { cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', label: 'Suspended' },
  };
  const { cls, label } = map[status] ?? { cls: '', label: status };
  return (
    <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border', cls)}>
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-text-muted text-sm w-40 shrink-0">{label}</span>
      <span className="text-text-primary text-sm">{value ?? '—'}</span>
    </div>
  );
}

// ─── Subnet list editor ───────────────────────────────────────────────────────

function SubnetListEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const v = input.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput('');
  }

  function remove(subnet: string) {
    onChange(value.filter((s) => s !== subnet));
  }

  return (
    <div>
      <label className="text-sm text-text-muted block mb-2">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={placeholder ?? '192.168.1.0/24'}
          className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-text-muted text-xs italic">None</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((subnet) => (
            <span
              key={subnet}
              className="inline-flex items-center gap-1 bg-bg-elevated border border-border rounded px-2 py-1 text-xs font-mono text-text-primary"
            >
              {subnet}
              <button
                onClick={() => remove(subnet)}
                className="text-text-muted hover:text-red-400 ml-0.5"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProbeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [probe, setProbe] = useState<Probe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [name, setName] = useState('');
  const [scanInterval, setScanInterval] = useState(300);
  const [scanConfig, setScanConfig] = useState<ProbeScanConfig>({
    excludedSubnets: [],
    extraSubnets: [],
  });

  const probeId = parseInt(id ?? '0', 10);

  const load = useCallback(async () => {
    try {
      const { probe: p } = await probeApi.get(probeId);
      setProbe(p);
      setName(p.name ?? p.hostname);
      setScanInterval(p.scanIntervalSeconds);
      setScanConfig(p.scanConfig);
    } catch {
      toast.error('Failed to load probe');
    } finally {
      setLoading(false);
    }
  }, [probeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await probeApi.update(probeId, {
        name: name.trim() || undefined,
        scanIntervalSeconds: scanInterval,
        scanConfig,
      });
      toast.success('Probe updated');
      void load();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    try {
      await probeApi.approve(probeId);
      toast.success('Probe approved');
      void load();
    } catch { toast.error('Failed to approve'); }
  }

  async function handleRefuse() {
    if (!confirm('Refuse this probe?')) return;
    try {
      await probeApi.refuse(probeId);
      toast.success('Probe refused');
      void load();
    } catch { toast.error('Failed to refuse'); }
  }

  async function handleCommand(command: string) {
    const labels: Record<string, string> = {
      uninstall: 'Queue uninstall command?',
      update: 'Queue update command?',
      rescan: 'Queue rescan command?',
    };
    if (!confirm(labels[command] ?? `Send command: ${command}?`)) return;
    try {
      await probeApi.sendCommand(probeId, command);
      toast.success(`Command "${command}" queued`);
      void load();
    } catch { toast.error('Failed to send command'); }
  }

  async function handleDelete() {
    if (!confirm('Delete this probe? This cannot be undone.')) return;
    try {
      await probeApi.remove(probeId);
      toast.success('Probe deleted');
      navigate('/admin/probes');
    } catch { toast.error('Failed to delete probe'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (!probe) {
    return (
      <div className="p-6">
        <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
          <AlertTriangle className="text-text-muted mx-auto mb-3" size={32} />
          <p className="text-text-primary font-medium">Probe not found</p>
          <Link to="/admin/probes" className="text-accent text-sm mt-2 inline-block">
            Back to probes
          </Link>
        </div>
      </div>
    );
  }

  const lastSeenDiff = probe.lastSeenAt
    ? Date.now() - new Date(probe.lastSeenAt).getTime()
    : null;
  const isOnline = lastSeenDiff !== null && lastSeenDiff < 5 * 60 * 1000;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link
        to="/admin/probes"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Probes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radar size={36} className="text-accent" />
            <span
              className={clsx(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-page',
                isOnline ? 'bg-emerald-500' : 'bg-zinc-600',
              )}
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {probe.name ?? probe.hostname}
            </h1>
            <p className="text-text-muted text-sm font-mono">{probe.uuid}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={probe.status} />
          {probe.status === 'pending' && (
            <>
              <button
                onClick={() => void handleApprove()}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <CheckCircle size={14} /> Approve
              </button>
              <button
                onClick={() => void handleRefuse()}
                className="btn-secondary flex items-center gap-1.5 text-sm text-red-400"
              >
                <XCircle size={14} /> Refuse
              </button>
            </>
          )}
          {probe.status === 'refused' && (
            <button
              onClick={() => void handleApprove()}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <CheckCircle size={14} /> Re-approve
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Monitor size={15} className="text-accent" /> Probe Info
        </h2>
        <InfoRow label="Hostname" value={probe.hostname} />
        <InfoRow
          label="Platform"
          value={
            probe.osInfo
              ? `${String(probe.osInfo.platform ?? '')} ${String(probe.osInfo.arch ?? '')} ${probe.osInfo.release ? `(${String(probe.osInfo.release)})` : ''}`
              : null
          }
        />
        <InfoRow label="Version" value={probe.probeVersion ? `v${probe.probeVersion}` : null} />
        <InfoRow
          label="Last seen"
          value={
            probe.lastSeenAt
              ? new Date(probe.lastSeenAt).toLocaleString()
              : 'Never'
          }
        />
        <InfoRow
          label="Approved"
          value={probe.approvedAt ? new Date(probe.approvedAt).toLocaleString() : null}
        />
        <InfoRow
          label="Assigned site"
          value={probe.siteId ? `Site #${probe.siteId}` : 'None (assign from settings below)'}
        />
        {probe.pendingCommand && (
          <InfoRow
            label="Pending command"
            value={
              <span className="text-yellow-400 flex items-center gap-1">
                <AlertTriangle size={13} /> {probe.pendingCommand}
              </span>
            }
          />
        )}
        {probe.updatingSince && (
          <InfoRow
            label="Updating since"
            value={new Date(probe.updatingSince).toLocaleString()}
          />
        )}
      </div>

      {/* Settings card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Activity size={15} className="text-accent" /> Scan Settings
        </h2>

        <div className="space-y-5">
          {/* Display name */}
          <div>
            <label className="text-sm text-text-muted block mb-2">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={probe.hostname}
            />
          </div>

          {/* Scan interval */}
          <div>
            <label className="text-sm text-text-muted block mb-2">
              Scan interval: <span className="text-text-primary font-medium">{scanInterval}s</span>
              {' '}({Math.round(scanInterval / 60)}m)
            </label>
            <input
              type="range"
              min={30}
              max={3600}
              step={30}
              value={scanInterval}
              onChange={(e) => setScanInterval(parseInt(e.target.value, 10))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>30s</span>
              <span>10m</span>
              <span>30m</span>
              <span>1h</span>
            </div>
          </div>

          {/* Excluded subnets */}
          <SubnetListEditor
            label="Excluded subnets (never scan)"
            value={scanConfig.excludedSubnets}
            onChange={(v) => setScanConfig((c) => ({ ...c, excludedSubnets: v }))}
            placeholder="10.0.0.0/8"
          />

          {/* Extra subnets */}
          <SubnetListEditor
            label="Extra subnets (scan in addition to auto-detected)"
            value={scanConfig.extraSubnets}
            onChange={(v) => setScanConfig((c) => ({ ...c, extraSubnets: v }))}
            placeholder="172.16.50.0/24"
          />

          <div className="flex justify-end pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* Commands card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Globe size={15} className="text-accent" /> Commands
        </h2>
        <p className="text-text-muted text-xs mb-4">
          Commands are queued and delivered on the probe&apos;s next push (within one scan interval).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void handleCommand('rescan')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} /> Force rescan
          </button>
          <button
            onClick={() => void handleCommand('update')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} /> Update probe
          </button>
          <button
            onClick={() => void handleCommand('uninstall')}
            className="btn-secondary flex items-center gap-1.5 text-sm text-red-400 border-red-500/30 hover:bg-red-500/10"
          >
            <Trash2 size={14} /> Uninstall
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-bg-card border border-red-500/20 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={15} /> Danger zone
        </h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-text-primary text-sm font-medium">Delete probe record</p>
            <p className="text-text-muted text-xs">
              Removes the probe from Oblimap. Discovered devices remain in their site.
            </p>
          </div>
          <button
            onClick={() => void handleDelete()}
            className="btn-secondary text-sm text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-1.5 shrink-0"
          >
            <Trash2 size={14} /> Delete probe
          </button>
        </div>
      </div>
    </div>
  );
}
