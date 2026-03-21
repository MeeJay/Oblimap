import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, Wifi, WifiOff, Radar,
  RefreshCw, Loader2, ArrowRight, Clock, AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { siteApi } from '../api/site.api';
import { probeApi } from '../api/probe.api';
import type { Site, Probe } from '@oblimap/shared';
import { clsx } from 'clsx';
import { useIpamLiveRefresh } from '@/hooks/useIpamLiveRefresh';

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'accent',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'accent' | 'green' | 'red' | 'blue' | 'yellow';
}) {
  const iconBg: Record<string, string> = {
    accent: 'bg-accent/10',
    green: 'bg-emerald-500/10',
    red: 'bg-red-500/10',
    blue: 'bg-blue-500/10',
    yellow: 'bg-yellow-500/10',
  };
  const iconColor: Record<string, string> = {
    accent: 'text-accent',
    green: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
  };
  return (
    <div className="rounded-xl border border-border bg-bg-card p-5 flex items-center gap-4">
      <div className={clsx('flex h-11 w-11 items-center justify-center rounded-xl shrink-0', iconBg[color])}>
        <span className={iconColor[color]}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-text-primary mt-0.5">{value}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatLastSeen(ts: string | null) {
  if (!ts) return null; // handled by caller with t('common.never')
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return { key: 'justNow' as const, diff };
  if (diff < 3_600_000) return { key: 'mAgo' as const, n: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { key: 'hAgo' as const, n: Math.floor(diff / 3_600_000) };
  return { key: 'date' as const, date: new Date(ts).toLocaleDateString() };
}

function probeOnline(p: Probe) {
  if (!p.lastSeenAt) return false;
  return Date.now() - new Date(p.lastSeenAt).getTime() < 5 * 60 * 1000;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [sites, setSites] = useState<Site[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [siteRes, probeRes] = await Promise.all([
        siteApi.list(),
        probeApi.list(),
      ]);
      setSites(siteRes.sites);
      setProbes(probeRes.probes);
    } catch {
      // Silently fail — dashboard shows zeros rather than crashing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh when probe data arrives (device status changes, new discoveries)
  useIpamLiveRefresh(() => void load(), 2000);

  // Computed stats
  const totalDevices = sites.reduce((s, x) => s + (x.itemCount ?? 0), 0);
  const totalOnline  = sites.reduce((s, x) => s + (x.onlineCount ?? 0), 0);
  const totalOffline = sites.reduce((s, x) => s + (x.offlineCount ?? 0), 0);
  const approvedProbes = probes.filter((p) => p.status === 'approved');
  const onlineProbeCount = approvedProbes.filter(probeOnline).length;
  const pendingProbeCount = probes.filter((p) => p.status === 'pending').length;

  // Sites sorted by online count desc (most active first)
  const topSites = [...sites]
    .sort((a, b) => (b.onlineCount ?? 0) - (a.onlineCount ?? 0))
    .slice(0, 6);

  // Most recently seen probes
  const recentProbes = [...approvedProbes]
    .sort((a, b) => {
      const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 5);

  function renderLastSeen(ts: string | null): string {
    const result = formatLastSeen(ts);
    if (!result) return t('common.never');
    if (result.key === 'justNow') return t('common.never').replace('Never', 'Just now'); // fallback
    if (result.key === 'mAgo') return `${result.n}m ago`;
    if (result.key === 'hAgo') return `${result.n}h ago`;
    return result.date ?? '—';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={24} className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{t('dashboard.title')}</h1>
            {user && (
              <p className="text-sm text-text-secondary mt-0.5">
                Welcome back, {user.displayName || user.username}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="p-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
          title={t('common.refresh')}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<MapPin size={20} />}
          label={t('dashboard.statSites')}
          value={sites.length}
          color="accent"
        />
        <StatCard
          icon={<Wifi size={20} />}
          label={t('dashboard.statOnline')}
          value={totalOnline}
          sub={totalDevices > 0 ? `${Math.round((totalOnline / totalDevices) * 100)}% of ${totalDevices} total` : `0 total`}
          color="green"
        />
        <StatCard
          icon={<WifiOff size={20} />}
          label={t('dashboard.statOffline')}
          value={totalOffline}
          sub={totalOffline > 0 ? 'Check site details' : 'All clear'}
          color={totalOffline > 0 ? 'red' : 'green'}
        />
        <StatCard
          icon={<Radar size={20} />}
          label={t('dashboard.statProbes')}
          value={`${onlineProbeCount} / ${approvedProbes.length}`}
          sub={
            pendingProbeCount > 0
              ? t('dashboard.pendingApproval', { count: pendingProbeCount })
              : 'None pending'
          }
          color={pendingProbeCount > 0 ? 'yellow' : 'blue'}
        />
      </div>

      {sites.length === 0 ? (
        /* Empty state */
        <div className="bg-bg-card border border-border rounded-xl p-16 text-center">
          <MapPin size={44} className="text-text-muted mx-auto mb-4" />
          <h2 className="text-text-primary font-semibold text-lg mb-2">{t('dashboard.noSites')}</h2>
          <p className="text-text-muted text-sm mb-6 max-w-sm mx-auto">
            {t('dashboard.noSitesDesc')}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/sites" className="btn-primary inline-flex items-center gap-1.5 text-sm">
              <MapPin size={14} />
              {t('dashboard.createSite')}
            </Link>
            <Link to="/admin/probes" className="btn-secondary inline-flex items-center gap-1.5 text-sm">
              <Radar size={14} />
              {t('dashboard.manageProbes')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sites list */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                {t('dashboard.labelSites')}
              </h2>
              <Link
                to="/sites"
                className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
              >
                {t('dashboard.viewAll')} <ArrowRight size={11} />
              </Link>
            </div>
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              {topSites.map((site, idx) => {
                const total = site.itemCount ?? 0;
                const online = site.onlineCount ?? 0;
                const offline = site.offlineCount ?? 0;
                const pct = total > 0 ? Math.round((online / total) * 100) : null;
                return (
                  <div
                    key={site.id}
                    data-status={offline > 0 ? 'down' : total > 0 ? 'up' : 'inactive'}
                    className={clsx(
                      'flex items-center gap-4 px-4 py-3 hover:bg-bg-elevated/50 transition-colors',
                      idx > 0 && 'border-t border-border',
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                      <MapPin size={14} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/sites/${site.id}`}
                        className="text-sm font-medium text-text-primary hover:text-accent transition-colors truncate block"
                      >
                        {site.name}
                      </Link>
                      {site.description && (
                        <p className="text-xs text-text-muted truncate">{site.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {offline > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <AlertTriangle size={11} /> {offline}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {online}<span className="text-text-muted/50">/</span>{total}
                      </span>
                      {pct !== null && (
                        <div className="w-16 h-1.5 bg-bg-elevated rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={clsx('h-full rounded-full transition-all', pct > 80 ? 'bg-emerald-500' : pct > 50 ? 'bg-yellow-400' : 'bg-red-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Probes panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                {t('dashboard.labelProbes')}
              </h2>
              <Link
                to="/admin/probes"
                className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
              >
                {t('dashboard.manage')} <ArrowRight size={11} />
              </Link>
            </div>

            {pendingProbeCount > 0 && (
              <Link
                to="/admin/probes"
                className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-3 hover:bg-yellow-500/15 transition-colors"
              >
                <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
                <p className="text-sm text-yellow-300">
                  {t('dashboard.pendingApproval', { count: pendingProbeCount })}
                </p>
                <ArrowRight size={12} className="text-yellow-400 ml-auto shrink-0" />
              </Link>
            )}

            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              {recentProbes.length === 0 ? (
                <div className="p-8 text-center">
                  <Radar size={28} className="text-text-muted mx-auto mb-2" />
                  <p className="text-text-muted text-xs">{t('dashboard.noApprovedProbes')}</p>
                </div>
              ) : (
                recentProbes.map((probe, idx) => {
                  const online = probeOnline(probe);
                  return (
                    <div
                      key={probe.id}
                      data-status={online ? 'up' : 'down'}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3 hover:bg-bg-elevated/50 transition-colors',
                        idx > 0 && 'border-t border-border',
                      )}
                    >
                      <span
                        className={clsx('w-2 h-2 rounded-full shrink-0', online ? 'bg-emerald-500' : 'bg-zinc-600')}
                      />
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/admin/probes/${probe.id}`}
                          className="text-sm text-text-primary hover:text-accent transition-colors truncate block"
                        >
                          {probe.name ?? probe.hostname}
                        </Link>
                        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          {renderLastSeen(probe.lastSeenAt)}
                        </p>
                      </div>
                      {probe.siteId && (
                        <span className="text-xs text-text-muted shrink-0">
                          {sites.find((s) => s.id === probe.siteId)?.name ?? `Site #${probe.siteId}`}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
