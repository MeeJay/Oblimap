import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, FolderOpen, Settings2, Bell, MapPin,
  Wifi, WifiOff, Radar, Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { useGroupStore } from '@/store/groupStore';
import { groupsApi } from '@/api/groups.api';
import { siteApi } from '@/api/site.api';
import type { MonitorGroup, Site } from '@oblimap/shared';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { NotificationBindingsPanel } from '@/components/notifications/NotificationBindingsPanel';
import toast from 'react-hot-toast';

type Tab = 'sites' | 'settings' | 'notifications';

// ─── Sites Tab ────────────────────────────────────────────────────────────────

function SitesTab({ groupId }: { groupId: number }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await siteApi.list({ groupId });
      setSites(res.sites);
    } catch {
      toast.error('Failed to load sites');
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
                    {site.name}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getGroup } = useGroupStore();

  const groupId = parseInt(id!, 10);

  const [group, setGroup] = useState<MonitorGroup | null>(getGroup(groupId) ?? null);
  const [loading, setLoading] = useState(!group);
  const [activeTab, setActiveTab] = useState<Tab>('sites');

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
        <h1 className="text-lg font-semibold text-text-primary">{group.name}</h1>
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
        {activeTab === 'sites' && <SitesTab groupId={groupId} />}

        {activeTab === 'settings' && (
          <SettingsPanel scope="group" scopeId={groupId} />
        )}

        {activeTab === 'notifications' && (
          <NotificationBindingsPanel scope="group" scopeId={groupId} />
        )}
      </div>
    </div>
  );
}
