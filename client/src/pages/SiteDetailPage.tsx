import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin, ArrowLeft, Plus, Pencil, Trash2, Loader2,
  RefreshCw, AlertTriangle, Info, FileDown, FileSpreadsheet, Radar,
  Network, GitBranch, Server, Printer, Cpu, Camera, Hash, Monitor,
  Phone, Smartphone, Laptop, Box, Wifi, Shield, HardDrive, HelpCircle,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { siteApi } from '../api/site.api';
import type { Site, SiteItem, IpReservation, DeviceType } from '@oblimap/shared';
import { clsx } from 'clsx';
import { SubnetHeatmap } from '@/components/ipam/SubnetHeatmap';
import { exportSiteCSV, exportSiteExcel } from '@/utils/exportSite';
import { getSocket } from '@/socket/socketClient';
import { SOCKET_EVENTS } from '@oblimap/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusDot(status: SiteItem['status']) {
  const map: Record<string, string> = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    reserved: 'bg-blue-500',
    unknown: 'bg-zinc-500',
  };
  return map[status] ?? 'bg-zinc-500';
}

function statusBadge(status: SiteItem['status']) {
  const map: Record<string, string> = {
    online: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    offline: 'bg-red-500/15 text-red-400 border-red-500/30',
    reserved: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    unknown: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  return map[status] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
}

function formatTime(ts: string | null) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── Device type icons ────────────────────────────────────────────────────────

const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  router:      Network,
  switch:      GitBranch,
  server:      Server,
  printer:     Printer,
  iot:         Cpu,
  camera:      Camera,
  counter:     Hash,
  workstation: Monitor,
  phone:       Phone,
  gsm:         Smartphone,
  laptop:      Laptop,
  vm:          Box,
  ap:          Wifi,
  firewall:    Shield,
  nas:         HardDrive,
  unknown:     HelpCircle,
};

function DeviceTypeIcon({ type, size = 12 }: { type: string; size?: number }) {
  const Icon = DEVICE_TYPE_ICONS[type] ?? HelpCircle;
  return <Icon size={size} />;
}

// ─── Open ports badges ────────────────────────────────────────────────────────

// Web ports that get a clickable http/https link
const WEB_PORT_MAP: Record<number, 'http' | 'https'> = {
  80: 'http', 443: 'https', 8080: 'http', 8443: 'https',
};

function PortBadges({ ip, ports }: { ip: string; ports: number[] | null | undefined }) {
  if (!ports || ports.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ports.map((port) => {
        const scheme = WEB_PORT_MAP[port];
        if (scheme) {
          const url = port === 80 || port === 443
            ? `${scheme}://${ip}`
            : `${scheme}://${ip}:${port}`;
          return (
            <a
              key={port}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${url}`}
              className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 transition-colors"
            >
              {port}
              <ExternalLink size={8} />
            </a>
          );
        }
        return (
          <span
            key={port}
            className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border bg-bg-elevated text-text-secondary border-border"
          >
            {port}
          </span>
        );
      })}
    </div>
  );
}

// ─── Device Modal ─────────────────────────────────────────────────────────────

function DeviceModal({
  siteId,
  item,
  onClose,
  onSaved,
}: {
  siteId: number;
  item: SiteItem | null; // null = new manual device
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = item !== null;
  const [ip, setIp] = useState(item?.ip ?? '');
  const [mac, setMac] = useState(item?.mac ?? '');
  const [customName, setCustomName] = useState(item?.customName ?? '');
  const [deviceType, setDeviceType] = useState<DeviceType>(item?.deviceType ?? 'unknown');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
    { value: 'unknown',     label: t('deviceTypes.unknown')     },
    { value: 'router',      label: t('deviceTypes.router')      },
    { value: 'switch',      label: t('deviceTypes.switch')      },
    { value: 'server',      label: t('deviceTypes.server')      },
    { value: 'workstation', label: t('deviceTypes.workstation') },
    { value: 'printer',     label: t('deviceTypes.printer')     },
    { value: 'iot',         label: t('deviceTypes.iot')         },
    { value: 'camera',      label: t('deviceTypes.camera')      },
    { value: 'counter',     label: t('deviceTypes.counter')     },
    { value: 'phone',       label: t('deviceTypes.phone')       },
    { value: 'gsm',         label: t('deviceTypes.gsm')         },
    { value: 'laptop',      label: t('deviceTypes.laptop')      },
    { value: 'vm',          label: t('deviceTypes.vm')          },
    { value: 'ap',          label: t('deviceTypes.ap')          },
    { value: 'firewall',    label: t('deviceTypes.firewall')    },
    { value: 'nas',         label: t('deviceTypes.nas')         },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await siteApi.updateItem(siteId, item.id, {
          customName: customName.trim() || null,
          deviceType,
          notes: notes.trim() || null,
        });
        toast.success(t('siteDetail.device.updated'));
      } else {
        await siteApi.createItem(siteId, {
          ip: ip.trim(),
          mac: mac.trim() || null,
          customName: customName.trim() || null,
          deviceType,
          notes: notes.trim() || null,
        });
        toast.success(t('siteDetail.device.added'));
      }
      onSaved();
    } catch {
      toast.error(isEdit ? t('siteDetail.device.failedUpdate') : t('siteDetail.device.failedAdd'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <span className="font-semibold text-text-primary">
            {isEdit ? t('siteDetail.deviceModal.editTitle') : t('siteDetail.deviceModal.addTitle')}
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t('siteDetail.deviceModal.ipLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.10"
                disabled={isEdit}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.deviceModal.macLabel')}</label>
              <input
                type="text"
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                disabled={isEdit}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.deviceModal.nameLabel')}</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={t('siteDetail.deviceModal.namePlaceholder')}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.deviceModal.typeLabel')}</label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value as DeviceType)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.deviceModal.notesLabel')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('siteDetail.deviceModal.notesPlaceholder')}
              rows={2}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
            <button
              type="submit"
              disabled={saving || !ip.trim()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? t('siteDetail.deviceModal.saveBtn') : t('siteDetail.deviceModal.addBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reservation Modal ────────────────────────────────────────────────────────

function ReservationModal({
  siteId,
  reservation,
  onClose,
  onSaved,
}: {
  siteId: number;
  reservation: IpReservation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = reservation !== null;
  const [ip, setIp] = useState(reservation?.ip ?? '');
  const [name, setName] = useState(reservation?.name ?? '');
  const [description, setDescription] = useState(reservation?.description ?? '');
  const [deviceType, setDeviceType] = useState<DeviceType | ''>(reservation?.deviceType ?? '');
  const [saving, setSaving] = useState(false);

  const DEVICE_TYPES_NO_UNKNOWN: { value: DeviceType; label: string }[] = [
    { value: 'router',      label: t('deviceTypes.router')      },
    { value: 'switch',      label: t('deviceTypes.switch')      },
    { value: 'server',      label: t('deviceTypes.server')      },
    { value: 'workstation', label: t('deviceTypes.workstation') },
    { value: 'printer',     label: t('deviceTypes.printer')     },
    { value: 'iot',         label: t('deviceTypes.iot')         },
    { value: 'camera',      label: t('deviceTypes.camera')      },
    { value: 'counter',     label: t('deviceTypes.counter')     },
    { value: 'phone',       label: t('deviceTypes.phone')       },
    { value: 'gsm',         label: t('deviceTypes.gsm')         },
    { value: 'laptop',      label: t('deviceTypes.laptop')      },
    { value: 'vm',          label: t('deviceTypes.vm')          },
    { value: 'ap',          label: t('deviceTypes.ap')          },
    { value: 'firewall',    label: t('deviceTypes.firewall')    },
    { value: 'nas',         label: t('deviceTypes.nas')         },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const data = {
        ip: ip.trim(),
        name: name.trim(),
        description: description.trim() || null,
        deviceType: (deviceType || null) as DeviceType | null,
      };
      if (isEdit) {
        await siteApi.updateReservation(siteId, reservation.id, {
          name: data.name,
          description: data.description,
          deviceType: data.deviceType,
        });
        toast.success(t('siteDetail.reservation.updated'));
      } else {
        await siteApi.createReservation(siteId, data);
        toast.success(t('siteDetail.reservation.created'));
      }
      onSaved();
    } catch {
      toast.error(isEdit ? t('siteDetail.reservation.failedUpdate') : t('siteDetail.reservation.failedCreate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <span className="font-semibold text-text-primary">
            {isEdit ? t('siteDetail.reservationModal.editTitle') : t('siteDetail.reservationModal.newTitle')}
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t('siteDetail.reservationModal.ipLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.50"
                disabled={isEdit}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t('siteDetail.reservationModal.nameLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('siteDetail.reservationModal.namePlaceholder')}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.reservationModal.typeLabel')}</label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value as DeviceType | '')}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">{t('siteDetail.reservationModal.typeAny')}</option>
              {DEVICE_TYPES_NO_UNKNOWN.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('siteDetail.reservationModal.descLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('siteDetail.reservationModal.descPlaceholder')}
              rows={2}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">{t('common.cancel')}</button>
            <button
              type="submit"
              disabled={saving || !ip.trim() || !name.trim()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? t('siteDetail.reservationModal.saveBtn') : t('siteDetail.reservationModal.reserveBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Devices Tab ──────────────────────────────────────────────────────────────

function DevicesTab({
  siteId,
  siteName,
  items,
  reservations,
  onRefresh,
}: {
  siteId: number;
  siteName: string;
  items: SiteItem[];
  reservations: IpReservation[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [deviceModal, setDeviceModal] = useState<SiteItem | null | undefined>(undefined);

  // Helper: resolve display label for a device type using translations
  function deviceTypeLabel(type: DeviceType): string {
    const key = `deviceTypes.${type}` as const;
    const translated = t(key);
    return translated !== key ? translated : type;
  }

  async function handleDelete(item: SiteItem) {
    const displayName = item.customName ?? item.hostname ?? item.ip;
    if (!confirm(t('siteDetail.device.confirmRemove', { name: displayName }))) return;
    try {
      await siteApi.removeItem(siteId, item.id);
      toast.success(t('siteDetail.device.removed'));
      onRefresh();
    } catch {
      toast.error(t('siteDetail.device.failedRemove'));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">
          {t('siteDetail.statDevices', { count: items.length })}
        </p>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={() => exportSiteCSV(siteName, items)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
                title="Export devices as CSV"
              >
                <FileDown size={14} />
                CSV
              </button>
              <button
                onClick={() => exportSiteExcel(siteName, items, reservations)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
                title="Export devices + reservations as Excel"
              >
                <FileSpreadsheet size={14} />
                Excel
              </button>
            </>
          )}
          <button
            onClick={() => setDeviceModal(null)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} />
            {t('siteDetail.device.addManually')}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
          <Info size={36} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">{t('siteDetail.device.noDevices')}</p>
          <p className="text-text-muted text-sm">{t('siteDetail.device.noDevicesDesc')}</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10">{t('siteDetail.device.colStatus')}</th>
                  <th className="px-4 py-3 text-left">{t('siteDetail.device.colIp')}</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">{t('siteDetail.device.colMac')}</th>
                  <th className="px-4 py-3 text-left">{t('siteDetail.device.colName')}</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">{t('siteDetail.device.colVendor')}</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">{t('siteDetail.device.colType')}</th>
                  <th className="px-4 py-3 text-left hidden xl:table-cell">{t('siteDetail.device.colLastSeen')}</th>
                  <th className="px-4 py-3 text-right">{t('siteDetail.device.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const displayName = item.customName ?? item.hostname;
                  return (
                    <tr
                      key={item.id}
                      className={clsx(
                        'border-b border-border last:border-0 hover:bg-bg-elevated/50 transition-colors',
                        item.status === 'offline' && 'opacity-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={clsx('w-2 h-2 rounded-full inline-block', statusDot(item.status))}
                          title={item.status}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-mono text-text-primary">{item.ip}</span>
                          {item.hasReservationConflict && (
                            <span
                              title={t('siteDetail.device.reservationConflict')}
                              className="text-orange-400"
                            >
                              <AlertTriangle size={12} />
                            </span>
                          )}
                          {item.isProbe && (
                            <Link
                              to={`/admin/probes/${item.probeId}`}
                              title="This device is a probe"
                              className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-accent/10 text-accent border-accent/30 hover:bg-accent/20 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <Radar size={9} />
                              Probe
                            </Link>
                          )}
                          {item.isManual && (
                            <span className="text-xs text-text-muted bg-bg-elevated border border-border rounded px-1">
                              {t('siteDetail.device.manualBadge')}
                            </span>
                          )}
                        </div>
                        <PortBadges ip={item.ip} ports={item.openPorts} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs font-mono text-text-secondary">
                          {item.mac ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {displayName ? (
                          <div>
                            <p className="text-sm text-text-primary">{displayName}</p>
                            {item.customName && item.hostname && (
                              <p className="text-xs text-text-muted">{item.hostname}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-text-secondary">{item.vendor ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border',
                            statusBadge(item.status),
                          )}
                        >
                          <DeviceTypeIcon type={item.deviceType} size={11} />
                          {deviceTypeLabel(item.deviceType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-text-secondary">{formatTime(item.lastSeenAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDeviceModal(item)}
                            className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                            title={t('common.edit')}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => void handleDelete(item)}
                            className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deviceModal !== undefined && (
        <DeviceModal
          siteId={siteId}
          item={deviceModal}
          onClose={() => setDeviceModal(undefined)}
          onSaved={() => { setDeviceModal(undefined); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Reservations Tab ─────────────────────────────────────────────────────────

function ReservationsTab({
  siteId,
  reservations,
  onRefresh,
}: {
  siteId: number;
  reservations: IpReservation[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<IpReservation | null | undefined>(undefined);

  function deviceTypeLabel(type: DeviceType): string {
    const key = `deviceTypes.${type}` as const;
    const translated = t(key);
    return translated !== key ? translated : type;
  }

  async function handleDelete(res: IpReservation) {
    if (!confirm(t('siteDetail.reservation.confirmRemove', { ip: res.ip, name: res.name }))) return;
    try {
      await siteApi.removeReservation(siteId, res.id);
      toast.success(t('siteDetail.reservation.removed'));
      onRefresh();
    } catch {
      toast.error(t('siteDetail.reservation.failedRemove'));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">
          {t('siteDetail.reservation.count', { count: reservations.length })}
        </p>
        <button
          onClick={() => setModal(null)}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          {t('siteDetail.reservation.newBtn')}
        </button>
      </div>

      {reservations.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
          <Info size={36} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">{t('siteDetail.reservation.noReservations')}</p>
          <p className="text-text-muted text-sm">{t('siteDetail.reservation.noReservationsDesc')}</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">{t('siteDetail.reservation.colIp')}</th>
                <th className="px-4 py-3 text-left">{t('siteDetail.reservation.colName')}</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">{t('siteDetail.reservation.colDescription')}</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">{t('siteDetail.reservation.colType')}</th>
                <th className="px-4 py-3 text-left">{t('siteDetail.reservation.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('siteDetail.reservation.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => (
                <tr
                  key={res.id}
                  className="border-b border-border last:border-0 hover:bg-bg-elevated/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-text-primary">{res.ip}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-primary">{res.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-text-secondary">{res.description ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-text-secondary">
                      {res.deviceType ? deviceTypeLabel(res.deviceType) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {res.isOccupied ? (
                      <div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded border bg-orange-500/15 text-orange-400 border-orange-500/30">
                          {t('siteDetail.reservation.occupied')}
                        </span>
                        {res.occupiedByMac && (
                          <p className="text-xs font-mono text-text-muted mt-0.5">{res.occupiedByMac}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        {t('siteDetail.reservation.free')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(res)}
                        className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
                        title={t('common.edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void handleDelete(res)}
                        className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== undefined && (
        <ReservationModal
          siteId={siteId}
          reservation={modal}
          onClose={() => setModal(undefined)}
          onSaved={() => { setModal(undefined); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'devices' | 'reservations' | 'heatmap';

export function SiteDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const siteId = Number(id);

  const [site, setSite] = useState<Site | null>(null);
  const [items, setItems] = useState<SiteItem[]>([]);
  const [reservations, setReservations] = useState<IpReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('devices');

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const [siteRes, itemsRes, resvRes] = await Promise.all([
        siteApi.get(siteId),
        siteApi.listItems(siteId),
        siteApi.listReservations(siteId),
      ]);
      setSite(siteRes.site);
      setItems(itemsRes.items);
      setReservations(resvRes.reservations);
    } catch {
      toast.error(t('siteDetail.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [siteId, t]);

  useEffect(() => { void load(); }, [load]);

  // Live-refresh: when a device on THIS site changes status or a new device is
  // discovered here, reload the items list automatically (debounced 1.5 s).
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !siteId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = (payload?: { siteId?: number }) => {
      if (payload?.siteId !== undefined && payload.siteId !== siteId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 1500);
    };

    const onItemStatus = (p: { siteId?: number }) => scheduleReload(p);
    const onNewDevice  = (p: { siteId?: number }) => scheduleReload(p);

    socket.on(SOCKET_EVENTS.ITEM_STATUS_CHANGED,   onItemStatus);
    socket.on(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, onNewDevice);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off(SOCKET_EVENTS.ITEM_STATUS_CHANGED,   onItemStatus);
      socket.off(SOCKET_EVENTS.NEW_DEVICE_DISCOVERED, onNewDevice);
    };
  }, [siteId, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-6 text-center">
        <p className="text-text-muted">{t('siteDetail.notFound')}</p>
        <Link to="/sites" className="text-accent hover:underline text-sm mt-2 inline-block">
          {t('siteDetail.backToSites')}
        </Link>
      </div>
    );
  }

  const onlineCount = items.filter((i) => i.status === 'online').length;
  const offlineCount = items.filter((i) => i.status === 'offline').length;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'devices',      label: t('siteDetail.tabDevices',      { count: items.length }) },
    { id: 'reservations', label: t('siteDetail.tabReservations', { count: reservations.length }) },
    { id: 'heatmap',      label: t('siteDetail.tabHeatmap') },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          to="/sites"
          className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors"
          title={t('siteDetail.backToSites')}
        >
          <ArrowLeft size={18} />
        </Link>
        <MapPin size={22} className="text-accent" />
        <h1 className="text-2xl font-semibold text-text-primary">{site.name}</h1>
        <button
          onClick={() => void load()}
          className="ml-auto p-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
          title={t('common.refresh')}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {site.description && (
        <p className="text-text-muted text-sm mb-4 ml-14">{site.description}</p>
      )}

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6 ml-14 flex-wrap text-sm text-text-secondary">
        <span>{t('siteDetail.statDevices', { count: items.length })}</span>
        <span className="text-emerald-400">{t('siteDetail.statOnline', { count: onlineCount })}</span>
        {offlineCount > 0 && (
          <span className="text-red-400">{t('siteDetail.statOffline', { count: offlineCount })}</span>
        )}
        <span>{t('siteDetail.statReservations', { count: reservations.length })}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === tabItem.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary',
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Tab content — all panels rendered simultaneously in a grid stack so
          the container's height equals max(all panels). Non-active panels are
          invisible and non-interactive but still occupy vertical space. */}
      <div style={{ display: 'grid' }}>
        <div style={{ gridArea: '1/1' }} className={tab !== 'devices' ? 'invisible pointer-events-none' : ''}>
          <DevicesTab
            siteId={siteId}
            siteName={site.name}
            items={items}
            reservations={reservations}
            onRefresh={() => void load()}
          />
        </div>
        <div style={{ gridArea: '1/1' }} className={tab !== 'reservations' ? 'invisible pointer-events-none' : ''}>
          <ReservationsTab siteId={siteId} reservations={reservations} onRefresh={() => void load()} />
        </div>
        <div style={{ gridArea: '1/1' }} className={tab !== 'heatmap' ? 'invisible pointer-events-none' : ''}>
          <SubnetHeatmap items={items} reservations={reservations} />
        </div>
      </div>
    </div>
  );
}
