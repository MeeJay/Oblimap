import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, FolderOpen, Settings2, Bell, MapPin,
  Wifi, WifiOff, Radar, Plus, Info,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { useAnonymize } from '@/utils/anonymize';
import { useGroupStore } from '@/store/groupStore';
import { groupsApi } from '@/api/groups.api';
import { siteApi } from '@/api/site.api';
import type { MonitorGroup, Probe, Site } from '@oblimap/shared';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { NotificationBindingsPanel } from '@/components/notifications/NotificationBindingsPanel';
import toast from 'react-hot-toast';

type Tab = 'sites' | 'probes' | 'settings' | 'notifications';

// ─── Sites Tab ────────────────────────────────────────────────────────────────

function SitesTab({ groupId, onStatsReady }: { groupId: number; onStatsReady?: (stats: SiteStats) => void }) {
  const { anonymize } = useAnonymize();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await siteApi.list({ groupId });
      setSites(res.sites);
      if (onStatsReady) {
        const totalDevices = res.sites.reduce((s: number, x: Site) => s + (x.itemCount ?? 0), 0);
        const totalOnline  = res.sites.reduce((s: number, x: Site) => s + (x.onlineCount ?? 0), 0);
        const totalProbes  = res.sites.reduce((s: number, x: Site) => s + (x.probeCount ?? 0), 0);
        onStatsReady({ siteCount: res.sites.length, deviceCount: totalDevices, onlineCount: totalOnline, probeCount: totalProbes });
      }
    } catch {
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, [groupId, onStatsReady]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
        <MapPin size={36} className="mx-auto mb-3 text-text-muted" />
        <p className="font-medium text-text-primary mb-1">No sites in this group</p>
        <p className="text-sm text-text-muted mb-5">
          Assign sites to this group when creating or editing them.
        </p>
        <Link
          to="/sites"
          className="btn-secondary inline-flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          Manage sites
        </Link>
      </div>
    );
  }

  const totalDevices = sites.reduce((s, x) => s + (x.itemCount ?? 0), 0);
  const totalOnline  = sites.reduce((s, x) => s + (x.onlineCount ?? 0), 0);
  const totalOffline = sites.reduce((s, x) => s + (x.offlineCount ?? 0), 0);

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">{sites.length} site{sites.length !== 1 ? 's' : ''}</span>
        <span>{totalDevices} device{totalDevices !== 1 ? 's' : ''}</span>
        <span className="text-emerald-400 flex items-center gap-1"><Wifi size={13} /> {totalOnline} online</span>
        {totalOffline > 0 && (
          <span className="text-red-400 flex items-center gap-1"><WifiOff size={13} /> {totalOffline} offline</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sites.map((site) => {
          const total   = site.itemCount ?? 0;
          const online  = site.onlineCount ?? 0;
          const offline = site.offlineCount ?? 0;
          const probes  = site.probeCount ?? 0;
          const pct     = total > 0 ? Math.round((online / total) * 100) : null;

          return (
            <Link
              key={site.id}
              to={`/sites/${site.id}`}
              className="group block rounded-xl border border-border bg-bg-card p-4 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 shrink-0 mt-0.5">
                  <MapPin size={14} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                    {anonymize(site.name, 'hostname')}
                  </p>
                  {site.description && (
                    <p className="text-xs text-text-muted truncate mt-0.5">{site.description}</p>
                  )}
                </div>
              </div>

              {/* Device stats */}
              <div className="flex items-center gap-3 text-xs text-text-secondary mb-2">
                <span>{total} device{total !== 1 ? 's' : ''}</span>
                {online > 0 && <span className="text-emerald-400">{online} online</span>}
                {offline > 0 && <span className="text-red-400">{offline} offline</span>}
              </div>

              {/* Progress bar */}
              {total > 0 && pct !== null && (
                <div className="w-full h-1 bg-bg-elevated rounded-full overflow-hidden mb-2">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pct > 80 ? 'bg-emerald-500' : pct > 50 ? 'bg-yellow-400' : 'bg-red-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* Probe count */}
              {probes > 0 && (
                <div className="flex items-center gap-1 text-xs text-text-muted">
                  <Radar size={11} />
                  {probes} probe{probes !== 1 ? 's' : ''}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Probes Tab ───────────────────────────────────────────────────────────────

interface GroupProbe extends Probe {
  siteName: string | null;
}

function ProbesTab({ groupId }: { groupId: number }) {
  const { t } = useTranslation();
  const { anonymize } = useAnonymize();
  const [probes, setProbes] = useState<GroupProbe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await groupsApi.getGroupProbes(groupId);
      setProbes(res.probes as GroupProbe[]);
    } catch {
      toast.error('Failed to load probes');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (probes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
        <Radar size={36} className="mx-auto mb-3 text-text-muted" />
        <p className="font-medium text-text-primary mb-1">{t('groups.detail.noProbes')}</p>
        <p className="text-sm text-text-muted">
          Probes will appear here when assigned to sites in this group.
        </p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      approved:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      pending:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      refused:   'bg-red-500/10 text-red-400 border-red-500/30',
      suspended: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
    };
    return map[status] ?? map.suspended;
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return t('common.never');
    const d = new Date(lastSeen);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 60_000) return '<1m ago';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-secondary text-left text-xs text-text-muted uppercase tracking-wider">
            <th className="px-4 py-3">{t('groups.detail.colProbe')}</th>
            <th className="px-4 py-3">{t('groups.detail.colSite')}</th>
            <th className="px-4 py-3">{t('groups.detail.colStatus')}</th>
            <th className="px-4 py-3">{t('groups.detail.colLastSeen')}</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <tr key={probe.id} className="border-b border-border last:border-0 hover:bg-bg-secondary/50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  to={`/admin/probes/${probe.id}`}
                  className="text-text-primary hover:text-accent transition-colors font-medium"
                >
                  {anonymize(probe.name || probe.hostname, 'hostname')}
                </Link>
                {probe.ip && (
                  <p className="text-xs text-text-muted mt-0.5">{anonymize(probe.ip, 'ip')}</p>
                )}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {probe.siteName ? anonymize(probe.siteName, 'hostname') : '-'}
              </td>
              <td className="px-4 py-3">
                <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', statusBadge(probe.status))}>
                  {probe.status}
                </span>
              </td>
              <td className="px-4 py-3 text-text-muted text-xs">
                {formatLastSeen(probe.lastSeenAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteStats {
  siteCount: number;
  deviceCount: number;
  onlineCount: number;
  probeCount: number;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getGroup } = useGroupStore();
  const { anonymize } = useAnonymize();

  const groupId = parseInt(id!, 10);

  const [group, setGroup] = useState<MonitorGroup | null>(getGroup(groupId) ?? null);
  const [loading, setLoading] = useState(!group);
  const [activeTab, setActiveTab] = useState<Tab>('sites');
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [probeCount, setProbeCount] = useState<number>(0);

  // Fetch probe count for tab badge
  useEffect(() => {
    groupsApi.getGroupProbes(groupId)
      .then((res) => setProbeCount(res.probes.length))
      .catch(() => { /* ignore */ });
  }, [groupId]);

  const handleStatsReady = useCallback((s: SiteStats) => {
    setStats(s);
  }, []);

  useEffect(() => {
    if (!group) {
      groupsApi.getById(groupId)
        .then((g) => setGroup(g))
        .catch(() => toast.error(t('groups.failedUpdate')))
        .finally(() => setLoading(false));
    }
  }, [groupId, group, t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">{t('groups.notFound')}</p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'sites',         label: t('nav.sites'),          icon: <MapPin size={15} /> },
    { id: 'probes',        label: t('groups.detail.tabProbes', { count: probeCount }), icon: <Radar size={15} /> },
    { id: 'settings',      label: t('nav.settings'),        icon: <Settings2 size={15} /> },
    { id: 'notifications', label: t('nav.notifications'),   icon: <Bell size={15} /> },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-secondary px-6 py-4">
        <Link
          to="/groups"
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={15} />
          {t('common.back')}
        </Link>
        <span className="text-text-muted">/</span>
        <FolderOpen size={16} className="text-accent shrink-0" />
        <h1 className="text-lg font-semibold text-text-primary">{anonymize(group.name, 'hostname')}</h1>
        {group.description && (
          <p className="text-sm text-text-muted hidden sm:block">— {group.description}</p>
        )}
        <Link
          to={`/group/${groupId}/edit`}
          className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors border border-border rounded px-2 py-1"
        >
          {t('groups.edit')}
        </Link>
      </div>

      {/* Aggregate stats */}
      {stats && (
        <div className="flex flex-wrap items-center gap-5 px-6 py-3 border-b border-border bg-bg-secondary/50 text-sm">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <MapPin size={13} className="text-accent" />
            <span className="font-medium text-text-primary">{stats.siteCount}</span> {t('nav.sites').toLowerCase()}
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="font-medium text-text-primary">{stats.deviceCount}</span> {t('groups.detail.totalDevices').toLowerCase()}
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Wifi size={13} />
            <span className="font-medium">{stats.onlineCount}</span> {t('groups.detail.online').toLowerCase()}
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Radar size={13} className="text-accent" />
            <span className="font-medium text-text-primary">{stats.probeCount}</span> {t('groups.detail.totalProbes').toLowerCase()}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mx-6 mb-2 rounded-lg bg-bg-secondary p-1 border border-border w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === tab.id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'sites' && <SitesTab groupId={groupId} onStatsReady={handleStatsReady} />}

        {activeTab === 'probes' && <ProbesTab groupId={groupId} />}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-muted flex items-start gap-3">
              <Info size={16} className="shrink-0 mt-0.5 text-accent" />
              {t('groups.detail.settingsInfo')}
            </div>
            <SettingsPanel scope="group" scopeId={groupId} />
          </div>
        )}

        {activeTab === 'notifications' && (
          <NotificationBindingsPanel scope="group" scopeId={groupId} />
        )}
      </div>
    </div>
  );
}
