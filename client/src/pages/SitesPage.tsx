import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Plus, Pencil, Trash2, Loader2, RefreshCw,
  Wifi, WifiOff, Monitor, Radar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { siteApi } from '../api/site.api';
import { groupsApi } from '../api/groups.api';
import type { Site, MonitorGroup } from '@oblimap/shared';
import { clsx } from 'clsx';
import { useIpamLiveRefresh } from '@/hooks/useIpamLiveRefresh';

// ─── Site Modal (create / edit) ───────────────────────────────────────────────

function SiteModal({
  site,
  groups,
  onClose,
  onSaved,
}: {
  site: Site | null;
  groups: MonitorGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = site !== null;
  const [name, setName] = useState(site?.name ?? '');
  const [description, setDescription] = useState(site?.description ?? '');
  const [groupId, setGroupId] = useState<string>(site?.groupId ? String(site.groupId) : '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        groupId: groupId ? Number(groupId) : null,
      };
      if (isEdit) {
        await siteApi.update(site.id, data);
        toast.success(t('sites.updated'));
      } else {
        await siteApi.create(data);
        toast.success(t('sites.created'));
      }
      onSaved();
    } catch {
      toast.error(isEdit ? t('sites.failedUpdate') : t('sites.failedCreate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <MapPin size={18} className="text-accent" />
            {isEdit ? t('sites.editSite') : t('sites.newSite')}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              {t('sites.form.name')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sites.form.namePlaceholder')}
              autoFocus
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('sites.form.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('sites.form.descPlaceholder')}
              rows={2}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {groups.length > 0 && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('sites.form.group')}</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">{t('sites.form.groupNone')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? t('common.save') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Site Card ────────────────────────────────────────────────────────────────

function SiteCard({
  site,
  onEdit,
  onDelete,
}: {
  site: Site;
  onEdit: (site: Site) => void;
  onDelete: (site: Site) => void;
}) {
  const { t } = useTranslation();
  const total = site.itemCount ?? 0;
  const online = site.onlineCount ?? 0;
  const offline = site.offlineCount ?? 0;
  const probes = site.probeCount ?? 0;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-accent/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <Link to={`/sites/${site.id}`} className="group flex items-center gap-2 min-w-0">
          <MapPin size={18} className="text-accent shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
              {site.name}
            </p>
            {site.description && (
              <p className="text-xs text-text-muted truncate mt-0.5">{site.description}</p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(site)}
            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
            title={t('common.edit')}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(site)}
            className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg-elevated rounded-lg px-3 py-2 text-center">
          <p className="text-lg font-bold text-text-primary">{total}</p>
          <p className="text-xs text-text-muted flex items-center justify-center gap-1">
            <Monitor size={10} /> {t('sites.devices')}
          </p>
        </div>
        <div className="bg-bg-elevated rounded-lg px-3 py-2 text-center">
          <p className={clsx('text-lg font-bold', online > 0 ? 'text-emerald-400' : 'text-text-muted')}>
            {online}
          </p>
          <p className="text-xs text-text-muted flex items-center justify-center gap-1">
            <Wifi size={10} /> {t('sites.online')}
          </p>
        </div>
        <div className="bg-bg-elevated rounded-lg px-3 py-2 text-center">
          <p className={clsx('text-lg font-bold', offline > 0 ? 'text-red-400' : 'text-text-muted')}>
            {offline}
          </p>
          <p className="text-xs text-text-muted flex items-center justify-center gap-1">
            <WifiOff size={10} /> {t('sites.offline')}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted flex items-center gap-1">
          <Radar size={11} />
          {probes === 0
            ? t('sites.noProbes')
            : t('sites.probeCount', { count: probes })}
        </span>
        <Link
          to={`/sites/${site.id}`}
          className="text-xs text-accent hover:text-accent-hover transition-colors font-medium"
        >
          {t('sites.viewBtn')}
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SitesPage() {
  const { t } = useTranslation();
  const [sites, setSites] = useState<Site[]>([]);
  const [groups, setGroups] = useState<MonitorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  // undefined = modal closed, null = creating new site, Site = editing existing site
  const [modalSite, setModalSite] = useState<Site | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [siteRes, groupRes] = await Promise.all([siteApi.list(), groupsApi.list()]);
      setSites(siteRes.sites);
      setGroups(groupRes);
    } catch {
      toast.error(t('sites.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh when probe pushes arrive (devices going online/offline, new discoveries)
  useIpamLiveRefresh(() => void load());

  async function handleDelete(site: Site) {
    if (!confirm(t('sites.confirmDelete', { name: site.name }))) return;
    try {
      await siteApi.remove(site.id);
      toast.success(t('sites.deleted'));
      void load();
    } catch {
      toast.error(t('sites.failedDelete'));
    }
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapPin size={24} className="text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary">{t('sites.title')}</h1>
          <span className="text-sm text-text-muted">({sites.length})</span>
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
            onClick={() => setModalSite(null)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={15} />
            {t('sites.newSite')}
          </button>
        </div>
      </div>

      {/* Grid */}
      {sites.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-16 text-center">
          <MapPin size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">{t('sites.noSites')}</p>
          <p className="text-text-muted text-sm mb-4">{t('sites.noSitesDesc')}</p>
          <button
            onClick={() => setModalSite(null)}
            className="btn-primary inline-flex items-center gap-1.5 text-sm"
          >
            <Plus size={15} />
            {t('sites.createFirst')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onEdit={(s) => setModalSite(s)}
              onDelete={(s) => void handleDelete(s)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalSite !== undefined && (
        <SiteModal
          site={modalSite}
          groups={groups}
          onClose={() => setModalSite(undefined)}
          onSaved={() => {
            setModalSite(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}
