import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Settings2, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { useGroupStore } from '@/store/groupStore';
import { groupsApi } from '@/api/groups.api';
import type { MonitorGroup, Site } from '@oblimap/shared';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { NotificationBindingsPanel } from '@/components/notifications/NotificationBindingsPanel';
import toast from 'react-hot-toast';

type Tab = 'sites' | 'settings' | 'notifications';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getGroup } = useGroupStore();

  const groupId = parseInt(id!, 10);

  const [group, setGroup] = useState<MonitorGroup | null>(getGroup(groupId) ?? null);
  const [sites] = useState<Site[]>([]);
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

  // Sites for this group will be fetched in Phase 3
  // For now, sites is always empty

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
    { id: 'sites',         label: 'Sites',          icon: <FolderOpen size={15} /> },
    { id: 'settings',      label: t('nav.settings'), icon: <Settings2 size={15} /> },
    { id: 'notifications', label: t('nav.notifications'), icon: <Bell size={15} /> },
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
        <h1 className="text-lg font-semibold text-text-primary">{group.name}</h1>
        {group.description && (
          <p className="text-sm text-text-muted hidden sm:block">— {group.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-bg-secondary px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'sites' && (
          <div>
            <p className="text-sm text-text-muted mb-4">
              Sites assigned to this group will appear here. Site management is coming in Phase 3.
            </p>
            {sites.length === 0 ? (
              <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
                <FolderOpen size={32} className="mx-auto mb-3 text-text-muted" />
                <p className="text-sm text-text-muted">No sites in this group yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {sites.map((site) => (
                  <li key={site.id} className="rounded-lg border border-border bg-bg-secondary p-4">
                    <p className="font-medium text-text-primary">{site.name}</p>
                    {site.description && (
                      <p className="text-sm text-text-muted">{site.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
