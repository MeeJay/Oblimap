import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Radar, ArrowLeft, CheckCircle, XCircle, Trash2, Plus,
  X, Save, Loader2, AlertTriangle, Monitor, RefreshCw,
  Activity, Globe, ArrowLeftRight, Crown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { probeApi } from '../api/probe.api';
import { siteApi } from '../api/site.api';
import type { Probe, ProbeScanConfig, Site } from '@oblimap/shared';
import { clsx } from 'clsx';
import { useAnonymize } from '../utils/anonymize';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Probe['status'] }) {
  const { t } = useTranslation();
  const map: Record<string, { cls: string; labelKey: string }> = {
    pending:   { cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',  labelKey: 'probesPage.detail.statusPending'        },
    approved:  { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', labelKey: 'probesPage.statusApproved'             },
    refused:   { cls: 'bg-red-500/15 text-red-400 border-red-500/30',             labelKey: 'probesPage.statusRefused'              },
    suspended: { cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',          labelKey: 'probesPage.statusSuspended'            },
  };
  const entry = map[status] ?? { cls: '', labelKey: '' };
  const label = entry.labelKey
    ? (status === 'pending' ? t('probesPage.statusPendingApproval') : t(entry.labelKey as never))
    : status;
  return (
    <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border', entry.cls)}>
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
  const { t } = useTranslation();
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
          <Plus size={14} /> {t('common.apply')}
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-text-muted text-xs italic">{t('probesPage.detail.noneSubnets')}</p>
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

// ─── Port list editor ─────────────────────────────────────────────────────────

const DEFAULT_PORT_SCAN_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3389, 8080, 8443];

function PortListEditor({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  function add() {
    const port = parseInt(input.trim(), 10);
    if (isNaN(port) || port < 1 || port > 65535 || value.includes(port)) return;
    onChange([...value, port].sort((a, b) => a - b));
    setInput('');
  }

  function remove(port: number) {
    onChange(value.filter((p) => p !== port));
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={1}
          max={65535}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="e.g. 8080"
          className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50"
        >
          <Plus size={14} /> {t('common.apply')}
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-text-muted text-xs italic">{t('probesPage.detail.noPortsConfigured')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((port) => (
            <span
              key={port}
              className="inline-flex items-center gap-1 bg-bg-elevated border border-border rounded px-2 py-1 text-xs font-mono text-text-primary"
            >
              {port}
              <button
                onClick={() => remove(port)}
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
  const { t } = useTranslation();
  const { anonymize } = useAnonymize();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [probe, setProbe] = useState<Probe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Sites list (for assignment)
  const [sites, setSites] = useState<Site[]>([]);

  // Editable state
  const [name, setName] = useState('');
  const [scanInterval, setScanInterval] = useState(300);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [scanConfigOverride, setScanConfigOverride] = useState(true);
  const [scanConfig, setScanConfig] = useState<ProbeScanConfig>({
    excludedSubnets: [],
    extraSubnets: [],
  });

  const [crossAppLinks, setCrossAppLinks] = useState<Array<{ appType: string; name: string; url: string; color: string | null }>>([]);

  const probeId = parseInt(id ?? '0', 10);

  const load = useCallback(async () => {
    try {
      const { probe: p } = await probeApi.get(probeId);
      setProbe(p);
      setName(p.name ?? p.hostname);
      setScanInterval(p.scanIntervalSeconds);
      setSelectedSiteId(p.siteId ?? null);
      setScanConfigOverride(p.scanConfigOverride ?? true);
      setScanConfig(p.scanConfig);
    } catch {
      toast.error(t('probesPage.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [probeId, t]);

  useEffect(() => { void load(); }, [load]);

  // Load sites once
  useEffect(() => {
    siteApi.list().then(({ sites: s }) => setSites(s)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!probe?.uuid) return;
    fetch(`/api/auth/device-links?uuid=${encodeURIComponent(probe.uuid)}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { success: boolean; data?: Array<{ appType: string; name: string; url: string; color: string | null }> }) => {
        if (d.success && d.data) setCrossAppLinks(d.data);
      })
      .catch(() => {});
  }, [probe?.uuid]);

  async function handleSave() {
    setSaving(true);
    try {
      await probeApi.update(probeId, {
        name: name.trim() || undefined,
        scanIntervalSeconds: scanInterval,
        siteId: selectedSiteId,
        scanConfig,
        scanConfigOverride,
      });
      toast.success(t('probesPage.updated'));
      void load();
    } catch {
      toast.error(t('probesPage.failedSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    try {
      await probeApi.approve(probeId);
      toast.success(t('probesPage.approved'));
      void load();
    } catch { toast.error(t('probesPage.failedApprove')); }
  }

  async function handleRefuse() {
    if (!confirm(t('probesPage.confirmRefuse'))) return;
    try {
      await probeApi.refuse(probeId);
      toast.success(t('probesPage.refused'));
      void load();
    } catch { toast.error(t('probesPage.failedRefuse')); }
  }

  async function handleCommand(command: string) {
    const confirmLabels: Record<string, string> = {
      uninstall: t('probesPage.detail.confirmUninstall'),
      update:    t('probesPage.detail.confirmUpdate'),
      rescan:    t('probesPage.detail.confirmRescan'),
    };
    if (!confirm(confirmLabels[command] ?? `Send command: ${command}?`)) return;
    try {
      await probeApi.sendCommand(probeId, command);
      toast.success(t('probesPage.detail.commandQueued', { command }));
      void load();
    } catch { toast.error(t('probesPage.detail.failedCommand')); }
  }

  async function handleTogglePrimary() {
    if (!probe) return;
    try {
      await probeApi.update(probeId, { isPrimary: !probe.isPrimary });
      toast.success(probe.isPrimary ? t('probesPage.detail.demoted', 'Demoted to secondary') : t('probesPage.detail.promoted', 'Promoted to primary'));
      void load();
    } catch { toast.error(t('probesPage.failedSave')); }
  }

  async function handleDelete() {
    if (!confirm(t('probesPage.confirmDelete'))) return;
    try {
      await probeApi.remove(probeId);
      toast.success(t('probesPage.deleted'));
      navigate('/admin/probes');
    } catch { toast.error(t('probesPage.failedDelete')); }
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
          <p className="text-text-primary font-medium">{t('probesPage.notFound')}</p>
          <Link to="/admin/probes" className="text-accent text-sm mt-2 inline-block">
            {t('probesPage.backLink')}
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
    <div className="p-6 space-y-6">
      {/* Back */}
      <Link
        to="/admin/probes"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        {t('probesPage.backToProbes')}
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
              {anonymize(probe.name ?? probe.hostname, 'hostname')}
            </h1>
            <p className="text-text-muted text-sm font-mono">{anonymize(probe.uuid)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {crossAppLinks.map(link => (
            <a
              key={link.appType}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open in ${link.name}`}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors"
              style={{ color: link.color ?? '#58a6ff', borderColor: `${link.color ?? '#58a6ff'}40`, backgroundColor: `${link.color ?? '#58a6ff'}0d` }}
            >
              <ArrowLeftRight size={12} />
              {link.name}
            </a>
          ))}
          <StatusBadge status={probe.status} />
          {probe.siteId && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
              probe.isPrimary
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-elevated text-text-secondary border border-border'
            }`}>
              {probe.isPrimary ? t('probesPage.detail.primary', 'Primary') : t('probesPage.detail.secondary', 'Secondary')}
            </span>
          )}
          {probe.status === 'approved' && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
              probe.wsConnected
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'bg-bg-elevated text-text-secondary border border-border'
            }`}>
              {probe.wsConnected ? 'WS' : 'HTTP'}
            </span>
          )}
          {probe.status === 'pending' && (
            <>
              <button
                onClick={() => void handleApprove()}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <CheckCircle size={14} /> {t('probesPage.detail.approve')}
              </button>
              <button
                onClick={() => void handleRefuse()}
                className="btn-secondary flex items-center gap-1.5 text-sm text-red-400"
              >
                <XCircle size={14} /> {t('probesPage.detail.refuse')}
              </button>
            </>
          )}
          {probe.status === 'refused' && (
            <button
              onClick={() => void handleApprove()}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <CheckCircle size={14} /> {t('probesPage.detail.reApprove')}
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Monitor size={15} className="text-accent" /> {t('probesPage.detail.probeInfo')}
        </h2>
        <InfoRow label={t('probesPage.detail.hostname')} value={anonymize(probe.hostname, 'hostname')} />
        <InfoRow
          label={t('probesPage.detail.platform')}
          value={
            probe.osInfo
              ? `${String(probe.osInfo.platform ?? '')} ${String(probe.osInfo.arch ?? '')} ${probe.osInfo.release ? `(${String(probe.osInfo.release)})` : ''}`
              : null
          }
        />
        <InfoRow label={t('probesPage.detail.version')} value={probe.probeVersion ? `v${probe.probeVersion}` : null} />
        <InfoRow
          label={t('probesPage.detail.lastSeen')}
          value={
            probe.lastSeenAt
              ? new Date(probe.lastSeenAt).toLocaleString()
              : t('common.never')
          }
        />
        <InfoRow
          label={t('probesPage.detail.approvedAt')}
          value={probe.approvedAt ? new Date(probe.approvedAt).toLocaleString() : null}
        />
        <InfoRow
          label={t('probesPage.detail.assignedSite')}
          value={
            probe.siteId
              ? (sites.find((s) => s.id === probe.siteId)?.name ?? `Site #${probe.siteId}`)
              : '—'
          }
        />
        {probe.pendingCommand && (
          <InfoRow
            label={t('probesPage.detail.pendingCommand')}
            value={
              <span className="text-yellow-400 flex items-center gap-1">
                <AlertTriangle size={13} /> {probe.pendingCommand}
              </span>
            }
          />
        )}
        {probe.updatingSince && (
          <InfoRow
            label={t('probesPage.detail.updatingSince')}
            value={new Date(probe.updatingSince).toLocaleString()}
          />
        )}
      </div>

      {/* Settings card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Activity size={15} className="text-accent" /> {t('probesPage.detail.scanSettings')}
        </h2>

        <div className="space-y-5">
          {/* Override group/site settings toggle */}
          <div className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary font-medium">{t('probesPage.detail.overrideSettings')}</p>
                <p className="text-xs text-text-muted mt-0.5">{t('probesPage.detail.overrideSettingsDesc')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={scanConfigOverride}
                onClick={() => setScanConfigOverride(!scanConfigOverride)}
                className={clsx(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                  scanConfigOverride ? 'bg-accent' : 'bg-bg-elevated border border-border',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    scanConfigOverride ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
            {!scanConfigOverride && (
              <p className="mt-2 text-xs text-accent/80 bg-accent/5 border border-accent/20 rounded-lg px-3 py-2">
                {t('probesPage.detail.inheritingSettings')}
              </p>
            )}
          </div>

          {/* Display name */}
          <div>
            <label className="text-sm text-text-muted block mb-2">
              {t('probesPage.detail.displayName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={probe.hostname}
            />
          </div>

          {/* Site assignment */}
          <div>
            <label className="text-sm text-text-muted block mb-2">
              {t('probesPage.detail.assignedSite')}
            </label>
            <select
              value={selectedSiteId ?? ''}
              onChange={(e) => setSelectedSiteId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">{t('probesPage.detail.noSite')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Scan config fields — only editable when override is ON */}
          {scanConfigOverride && (
            <>
              {/* Scan interval */}
              <div>
                <label className="text-sm text-text-muted block mb-2">
                  {t('probesPage.detail.scanInterval', {
                    seconds: scanInterval,
                    minutes: Math.round(scanInterval / 60),
                  })}
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
                label={t('probesPage.detail.excludedSubnets')}
                value={scanConfig.excludedSubnets}
                onChange={(v) => setScanConfig((c) => ({ ...c, excludedSubnets: v }))}
                placeholder="10.0.0.0/8"
              />

              {/* Extra subnets */}
              <SubnetListEditor
                label={t('probesPage.detail.extraSubnets')}
                value={scanConfig.extraSubnets}
                onChange={(v) => setScanConfig((c) => ({ ...c, extraSubnets: v }))}
                placeholder="172.16.50.0/24"
              />

              {/* Port scan */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-text-primary font-medium">{t('probesPage.detail.portScanEnabled')}</p>
                    <p className="text-xs text-text-muted mt-0.5">{t('probesPage.detail.portScanDesc')}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={scanConfig.portScanEnabled ?? false}
                    onClick={() => {
                      const enabling = !(scanConfig.portScanEnabled ?? false);
                      setScanConfig((c) => ({
                        ...c,
                        portScanEnabled: enabling,
                        portScanPorts: enabling && (!c.portScanPorts || c.portScanPorts.length === 0)
                          ? DEFAULT_PORT_SCAN_PORTS
                          : c.portScanPorts,
                      }));
                    }}
                    className={clsx(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                      (scanConfig.portScanEnabled ?? false) ? 'bg-accent' : 'bg-bg-elevated border border-border',
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                        (scanConfig.portScanEnabled ?? false) ? 'translate-x-6' : 'translate-x-1',
                      )}
                    />
                  </button>
                </div>
                {(scanConfig.portScanEnabled ?? false) && (
                  <div>
                    <label className="text-sm text-text-muted block mb-2">{t('probesPage.detail.portScanPorts')}</label>
                    <PortListEditor
                      value={scanConfig.portScanPorts ?? []}
                      onChange={(v) => setScanConfig((c) => ({ ...c, portScanPorts: v }))}
                    />
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setScanConfig((c) => ({ ...c, portScanPorts: DEFAULT_PORT_SCAN_PORTS }))}
                        className="text-xs text-accent hover:underline"
                      >
                        {t('probesPage.detail.portScanReset')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('probesPage.detail.saveChanges')}
            </button>
          </div>
        </div>
      </div>

      {/* Commands card */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Globe size={15} className="text-accent" /> {t('probesPage.detail.commands')}
        </h2>
        <p className="text-text-muted text-xs mb-4">
          {t('probesPage.detail.commandsDesc')}
        </p>
        <div className="flex flex-wrap gap-2">
          {probe.siteId && (
            <button
              onClick={() => void handleTogglePrimary()}
              className={clsx(
                'btn-secondary flex items-center gap-1.5 text-sm',
                probe.isPrimary && 'text-accent border-accent/30',
              )}
            >
              <Crown size={14} />
              {probe.isPrimary
                ? t('probesPage.detail.demoteToPrimary', 'Demote to secondary')
                : t('probesPage.detail.promoteToPrimary', 'Promote to primary')}
            </button>
          )}
          <button
            onClick={() => void handleCommand('rescan')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} /> {t('probesPage.detail.forceRescan')}
          </button>
          <button
            onClick={() => void handleCommand('update')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} /> {t('probesPage.detail.updateProbe')}
          </button>
          <button
            onClick={() => void handleCommand('uninstall')}
            className="btn-secondary flex items-center gap-1.5 text-sm text-red-400 border-red-500/30 hover:bg-red-500/10"
          >
            <Trash2 size={14} /> {t('probesPage.detail.uninstall')}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-bg-card border border-red-500/20 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
          <AlertTriangle size={15} /> {t('probesPage.detail.dangerZone')}
        </h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-text-primary text-sm font-medium">{t('probesPage.detail.deleteRecord')}</p>
            <p className="text-text-muted text-xs">{t('probesPage.detail.deleteRecordDesc')}</p>
          </div>
          <button
            onClick={() => void handleDelete()}
            className="btn-secondary text-sm text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-1.5 shrink-0"
          >
            <Trash2 size={14} /> {t('probesPage.detail.deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
