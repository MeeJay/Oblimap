import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertTriangle, Unplug, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { tunnelApi } from '../../api/tunnel.api';
import type { Tunnel, Probe } from '@oblimap/shared';

interface TunnelDialogProps {
  siteId: number;
  targetIp: string;
  targetPort: number;
  probes: Probe[];
  onClose: () => void;
}

const WEB_PORTS = new Set([80, 443, 8080, 8443]);

export default function TunnelDialog({ siteId, targetIp, targetPort, probes, onClose }: TunnelDialogProps) {
  const { t } = useTranslation();
  const [tunnel, setTunnel] = useState<Tunnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProbeId, setSelectedProbeId] = useState<number | null>(null);

  const wsProbes = probes.filter((p) => p.wsConnected && p.status === 'approved' && p.siteId === siteId);

  async function openTunnel() {
    setLoading(true);
    setError(null);
    try {
      const { tunnel: newTunnel } = await tunnelApi.open(siteId, targetIp, targetPort, selectedProbeId);
      setTunnel(newTunnel);
      toast.success(t('tunnel.opened', 'Tunnel opened'));
    } catch (err: unknown) {
      // Extract error message from Axios response or fallback to Error.message
      let msg = 'Failed to open tunnel';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: { error?: string; message?: string } } }).response;
        msg = resp?.data?.error ?? resp?.data?.message ?? msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function closeTunnel() {
    if (!tunnel) return;
    try {
      await tunnelApi.close(tunnel.id);
      setTunnel(null);
      toast.success(t('tunnel.closed', 'Tunnel closed'));
      onClose();
    } catch {
      toast.error(t('tunnel.failedClose', 'Failed to close tunnel'));
    }
  }

  // Auto-open on mount
  useEffect(() => {
    void openTunnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll tunnel status while active
  useEffect(() => {
    if (!tunnel || tunnel.status === 'closed' || tunnel.status === 'error') return;
    const interval = setInterval(async () => {
      try {
        const { tunnel: updated } = await tunnelApi.get(tunnel.id);
        setTunnel(updated);
        if (updated.status === 'closed' || updated.status === 'error') {
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [tunnel?.id, tunnel?.status]);

  const isWebPort = WEB_PORTS.has(targetPort);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Globe size={15} className="text-accent" />
            {t('tunnel.title', 'TCP Tunnel')}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated text-text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Target info */}
          <div className="text-xs text-text-secondary space-y-1">
            <div><span className="text-text-muted">{t('tunnel.target', 'Target')}:</span> {targetIp}:{targetPort}</div>
            {tunnel && (
              <div>
                <span className="text-text-muted">{t('tunnel.probeId', 'Probe')}:</span> #{tunnel.probeId}
              </div>
            )}
          </div>

          {/* Probe selector (before tunnel is opened) */}
          {!tunnel && !loading && wsProbes.length > 1 && (
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('tunnel.selectProbe', 'Select probe')}</label>
              <select
                value={selectedProbeId ?? ''}
                onChange={(e) => setSelectedProbeId(e.target.value ? Number(e.target.value) : null)}
                className="input-field text-sm w-full"
              >
                <option value="">{t('tunnel.autoSelect', 'Auto-select')}</option>
                {wsProbes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.hostname} {p.isPrimary ? '(Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status */}
          {loading && (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Loader2 size={16} className="animate-spin text-accent" />
              {t('tunnel.opening', 'Opening tunnel...')}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {tunnel?.status === 'active' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-accent text-sm">
                <CheckCircle size={16} />
                {t('tunnel.active', 'Tunnel active')}
              </div>

              {isWebPort && (
                <p className="text-xs text-text-muted">
                  {t('tunnel.webPortInfo', 'This is a web port. The tunnel is relaying HTTP traffic through the probe.')}
                </p>
              )}

              {!isWebPort && (
                <p className="text-xs text-text-muted">
                  {t('tunnel.tcpInfo', 'Tunnel is active. TCP traffic to {ip}:{port} is being relayed through the probe.', {
                    ip: targetIp,
                    port: targetPort,
                  })}
                </p>
              )}
            </div>
          )}

          {tunnel?.status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle size={16} />
              {tunnel.errorMessage ?? t('tunnel.unknownError', 'Unknown error')}
            </div>
          )}

          {tunnel?.status === 'closed' && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Unplug size={16} />
              {t('tunnel.closed', 'Tunnel closed')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          {!tunnel && error && (
            <button
              onClick={() => { setError(null); void openTunnel(); }}
              className="btn-primary text-sm"
            >
              {t('tunnel.retry', 'Retry')}
            </button>
          )}
          {tunnel?.status === 'active' && (
            <button
              onClick={() => void closeTunnel()}
              className="btn-secondary text-sm text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-1.5"
            >
              <Unplug size={14} />
              {t('tunnel.close', 'Close tunnel')}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
