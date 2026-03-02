import { useState, useEffect, type FormEvent } from 'react';
import { Shield, Server, Plus, Pencil, Trash2, Wifi, Eye, EyeOff } from 'lucide-react';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useAuthStore } from '@/store/authStore';
import { smtpServerApi, type CreateSmtpServerRequest } from '@/api/smtpServer.api';
import { appConfigApi } from '@/api/appConfig.api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import type { SmtpServer, AppConfig } from '@obliview/shared';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';

type SmtpFormMode = 'create' | 'edit' | null;

interface SmtpForm {
  name: string;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
}

const emptySmtpForm = (): SmtpForm => ({
  name: '',
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  fromAddress: '',
});

export function SettingsPage() {
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();

  // ── SMTP Servers ──
  const [servers, setServers] = useState<SmtpServer[]>([]);
  const [smtpMode, setSmtpMode] = useState<SmtpFormMode>(null);
  const [editingServer, setEditingServer] = useState<SmtpServer | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpForm>(emptySmtpForm());
  const [showPassword, setShowPassword] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  // ── App Config (2FA) ──
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    if (!admin) return;
    smtpServerApi.list().then(setServers).catch(() => {});
    appConfigApi.getConfig().then(setAppConfig).catch(() => {});
  }, [admin]);

  function openCreate() {
    setEditingServer(null);
    setSmtpForm(emptySmtpForm());
    setShowPassword(false);
    setSmtpMode('create');
  }

  function openEdit(server: SmtpServer) {
    setEditingServer(server);
    setSmtpForm({
      name: server.name,
      host: server.host,
      port: String(server.port),
      secure: server.secure,
      username: server.username,
      password: '',
      fromAddress: server.fromAddress,
    });
    setShowPassword(false);
    setSmtpMode('edit');
  }

  function closeSmtpModal() {
    setSmtpMode(null);
    setEditingServer(null);
  }

  async function handleSmtpSubmit(e: FormEvent) {
    e.preventDefault();
    setSmtpSaving(true);
    try {
      const data: CreateSmtpServerRequest = {
        name: smtpForm.name,
        host: smtpForm.host,
        port: parseInt(smtpForm.port, 10),
        secure: smtpForm.secure,
        username: smtpForm.username,
        password: smtpForm.password,
        fromAddress: smtpForm.fromAddress,
      };
      if (smtpMode === 'create') {
        const created = await smtpServerApi.create(data);
        setServers((prev) => [...prev, created]);
        toast.success('SMTP server created');
      } else if (editingServer) {
        const payload = smtpForm.password ? data : { ...data, password: undefined };
        const updated = await smtpServerApi.update(editingServer.id, payload);
        setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success('SMTP server updated');
      }
      closeSmtpModal();
    } catch {
      toast.error('Failed to save SMTP server');
    } finally {
      setSmtpSaving(false);
    }
  }

  async function handleDelete(server: SmtpServer) {
    if (!confirm(`Delete SMTP server "${server.name}"?`)) return;
    try {
      await smtpServerApi.delete(server.id);
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      toast.success('Server deleted');
    } catch {
      toast.error('Failed to delete server');
    }
  }

  async function handleTest(server: SmtpServer) {
    setTestingId(server.id);
    try {
      await smtpServerApi.test(server.id);
      toast.success(`Connection to "${server.name}" successful`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      toast.error(msg);
    } finally {
      setTestingId(null);
    }
  }

  async function setConfigKey(key: keyof AppConfig, value: boolean | number | null) {
    if (!appConfig) return;
    setConfigSaving(true);
    try {
      await appConfigApi.setConfig(key, value);
      setAppConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    } catch {
      toast.error('Failed to update setting');
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl min-w-0 mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Global Settings</h1>
        <p className="text-sm text-text-muted">
          These defaults apply to all groups and monitors unless overridden at a lower level.
        </p>
      </div>

      <SettingsPanel scope="global" scopeId={null} title="Default Settings" />

      {admin && (
        <>
          {/* ── SMTP Servers ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">SMTP Servers</h2>
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} className="mr-1" /> Add Server
              </Button>
            </div>
            {servers.length === 0 ? (
              <div className="rounded-lg border border-border bg-bg-secondary p-5 text-sm text-text-muted flex items-center gap-3">
                <Server size={16} className="shrink-0" />
                No SMTP servers configured. Add one to use Email notifications.
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-2.5 font-medium text-text-secondary">Name</th>
                      <th className="px-4 py-2.5 font-medium text-text-secondary">Host</th>
                      <th className="px-4 py-2.5 font-medium text-text-secondary">From</th>
                      <th className="px-4 py-2.5 font-medium text-text-secondary text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((server) => (
                      <tr key={server.id} className="border-b border-border last:border-0 hover:bg-bg-hover transition-colors">
                        <td className="px-4 py-3 text-text-primary font-medium">{server.name}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {server.host}:{server.port}
                          {server.secure && <span className="ml-1.5 text-xs bg-green-500/10 text-green-400 rounded px-1">TLS</span>}
                        </td>
                        <td className="px-4 py-3 text-text-muted">{server.fromAddress}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleTest(server)}
                              disabled={testingId === server.id}
                              className="p-1.5 rounded text-text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-colors disabled:opacity-50"
                              title="Test connection"
                            >
                              <Wifi size={14} />
                            </button>
                            <button
                              onClick={() => openEdit(server)}
                              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(server)}
                              className="p-1.5 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title="Delete"
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
          </div>

          {/* ── Security / 2FA ── */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Security</h2>
            <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border">
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="flex items-start gap-3">
                  <Shield size={16} className="text-text-muted mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Allow users to configure 2FA</p>
                    <p className="text-xs text-text-muted mt-0.5">Users can enable TOTP or Email OTP from their profile.</p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={appConfig?.allow_2fa ?? false}
                  disabled={configSaving || !appConfig}
                  onClick={() => setConfigKey('allow_2fa', !appConfig?.allow_2fa)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50',
                    appConfig?.allow_2fa ? 'bg-primary' : 'bg-bg-tertiary',
                  )}
                >
                  <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', appConfig?.allow_2fa ? 'translate-x-4' : 'translate-x-0')} />
                </button>
              </div>

              <div className={cn('flex items-start justify-between gap-4 p-4', !appConfig?.allow_2fa && 'opacity-50 pointer-events-none')}>
                <div className="flex items-start gap-3">
                  <Shield size={16} className="text-text-muted mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Force 2FA for all users</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Users without a 2FA method will be warned to set one up.
                      Bypass via <code className="text-xs font-mono">DISABLE_2FA_FORCE=true</code> in .env.
                    </p>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={appConfig?.force_2fa ?? false}
                  disabled={configSaving || !appConfig || !appConfig.allow_2fa}
                  onClick={() => setConfigKey('force_2fa', !appConfig?.force_2fa)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50',
                    appConfig?.force_2fa ? 'bg-primary' : 'bg-bg-tertiary',
                  )}
                >
                  <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', appConfig?.force_2fa ? 'translate-x-4' : 'translate-x-0')} />
                </button>
              </div>

              <div className={cn('flex items-start gap-4 p-4', !appConfig?.allow_2fa && 'opacity-50 pointer-events-none')}>
                <Server size={16} className="text-text-muted mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">SMTP Server for Email OTP</p>
                  <p className="text-xs text-text-muted mt-0.5">Used to send one-time codes when Email OTP is enabled.</p>
                  <select
                    className="mt-2 w-full max-w-xs rounded-md border border-border bg-bg-primary px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    value={appConfig?.otp_smtp_server_id ?? ''}
                    disabled={configSaving || !appConfig || !appConfig.allow_2fa}
                    onChange={(e) => setConfigKey('otp_smtp_server_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                  >
                    <option value="">— None —</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {smtpMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg-secondary rounded-xl shadow-2xl border border-border w-full max-w-md">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-text-primary">
                {smtpMode === 'create' ? 'Add SMTP Server' : 'Edit SMTP Server'}
              </h3>
            </div>
            <form onSubmit={handleSmtpSubmit} className="p-5 space-y-3">
              <Input
                label="Name"
                value={smtpForm.name}
                onChange={(e) => setSmtpForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Main SMTP"
                required
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input
                    label="Host"
                    value={smtpForm.host}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
                    placeholder="smtp.example.com"
                    required
                  />
                </div>
                <Input
                  label="Port"
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
                  placeholder="587"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={smtpForm.secure}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, secure: e.target.checked }))}
                  className="rounded border-border"
                />
                Use TLS (port 465)
              </label>
              <Input
                label="Username"
                value={smtpForm.username}
                onChange={(e) => setSmtpForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
              <div className="relative">
                <Input
                  label={smtpMode === 'edit' ? 'Password (leave blank to keep current)' : 'Password'}
                  type={showPassword ? 'text' : 'password'}
                  value={smtpForm.password}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
                  required={smtpMode === 'create'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 bottom-2 text-text-muted hover:text-text-primary"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Input
                label="From Address"
                type="email"
                value={smtpForm.fromAddress}
                onChange={(e) => setSmtpForm((f) => ({ ...f, fromAddress: e.target.value }))}
                placeholder="alerts@example.com"
                required
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={closeSmtpModal}>Cancel</Button>
                <Button type="submit" disabled={smtpSaving}>
                  {smtpSaving ? 'Saving...' : smtpMode === 'create' ? 'Create' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
