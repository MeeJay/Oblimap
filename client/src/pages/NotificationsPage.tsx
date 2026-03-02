import { useState, useEffect, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Bell, TestTube2, Zap, Loader2 } from 'lucide-react';
import type {
  NotificationChannel,
  NotificationPluginMeta,
  NotificationBinding,
  SmtpServer,
} from '@obliview/shared';
import { notificationsApi } from '@/api/notifications.api';
import { smtpServerApi } from '@/api/smtpServer.api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import toast from 'react-hot-toast';

export function NotificationsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [plugins, setPlugins] = useState<NotificationPluginMeta[]>([]);
  const [globalBindings, setGlobalBindings] = useState<NotificationBinding[]>([]);
  const [smtpServers, setSmtpServers] = useState<SmtpServer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [formName, setFormName] = useState('');
  const [formConfig, setFormConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  const load = async () => {
    try {
      const [ch, pl, gb] = await Promise.all([
        notificationsApi.listChannels(),
        notificationsApi.getPlugins(),
        notificationsApi.getBindings('global', null),
      ]);
      setChannels(ch);
      setPlugins(pl);
      setGlobalBindings(gb);
    } catch {
      toast.error('Failed to load notifications');
    }
  };

  useEffect(() => {
    load();
    smtpServerApi.list().then(setSmtpServers).catch(() => {});
  }, []);

  const selectedPlugin = plugins.find((p) => p.type === selectedType);

  const openCreate = () => {
    setEditingId(null);
    setSelectedType(plugins[0]?.type || '');
    setFormName('');
    setFormConfig({});
    setShowForm(true);
  };

  const openEdit = (ch: NotificationChannel) => {
    setEditingId(ch.id);
    setSelectedType(ch.type);
    setFormName(ch.name);
    setFormConfig({ ...ch.config });
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await notificationsApi.updateChannel(editingId, {
          name: formName,
          config: formConfig,
        });
        toast.success('Channel updated');
      } else {
        await notificationsApi.createChannel({
          name: formName,
          type: selectedType,
          config: formConfig,
        });
        toast.success('Channel created');
      }
      setShowForm(false);
      load();
    } catch {
      toast.error('Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete notification channel "${name}"?`)) return;
    try {
      await notificationsApi.deleteChannel(id);
      toast.success('Channel deleted');
      load();
    } catch {
      toast.error('Failed to delete channel');
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      await notificationsApi.testChannel(id);
      toast.success('Test notification sent!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      toast.error(msg);
    } finally {
      setTesting(null);
    }
  };

  const toggleGlobalBinding = async (channelId: number) => {
    const existing = globalBindings.find((b) => b.channelId === channelId);
    try {
      if (existing) {
        await notificationsApi.removeBinding(channelId, 'global', null);
        toast.success('Removed from global');
      } else {
        await notificationsApi.addBinding(channelId, 'global', null);
        toast.success('Added to global');
      }
      load();
    } catch {
      toast.error('Failed to update binding');
    }
  };

  const isGloballyBound = (channelId: number) =>
    globalBindings.some((b) => b.channelId === channelId);

  return (
    <div className="p-6 max-w-5xl min-w-0 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Notifications</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} className="mr-1.5" />
          New Channel
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-border bg-bg-secondary p-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">
            {editingId ? 'Edit Channel' : 'New Channel'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Channel Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Ops Discord"
              required
            />

            {!editingId && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-secondary">Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setFormConfig({});
                  }}
                  className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {plugins.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {selectedPlugin && (
                  <p className="text-xs text-text-muted mt-1">{selectedPlugin.description}</p>
                )}
              </div>
            )}

            {/* Dynamic config fields */}
            {(selectedPlugin || plugins.find((p) => p.type === selectedType))?.configFields.map((field) => {
              if (field.type === 'boolean') {
                return (
                  <div key={field.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`cfg-${field.key}`}
                      checked={Boolean(formConfig[field.key])}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, [field.key]: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border bg-bg-tertiary text-accent focus:ring-accent"
                    />
                    <label htmlFor={`cfg-${field.key}`} className="text-sm text-text-secondary">
                      {field.label}
                    </label>
                  </div>
                );
              }
              if (field.type === 'smtp_server_select') {
                return (
                  <div key={field.key} className="space-y-1">
                    <label className="block text-sm font-medium text-text-secondary">
                      {field.label}{field.required && <span className="text-status-down ml-1">*</span>}
                    </label>
                    <select
                      value={String(formConfig[field.key] ?? '')}
                      onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value ? Number(e.target.value) : '' })}
                      required={field.required}
                      className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">— Select SMTP Server —</option>
                      {smtpServers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.host}:{s.port})</option>
                      ))}
                    </select>
                    {smtpServers.length === 0 && (
                      <p className="text-xs text-amber-400">No SMTP servers configured. Add one in Settings → SMTP Servers.</p>
                    )}
                  </div>
                );
              }
              return (
                <Input
                  key={field.key}
                  label={field.label}
                  type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                  value={String(formConfig[field.key] ?? '')}
                  onChange={(e) =>
                    setFormConfig({
                      ...formConfig,
                      [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                />
              );
            })}

            <div className="flex items-center gap-3">
              <Button type="submit" loading={saving}>
                {editingId ? 'Save' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Channel list */}
      <div className="rounded-lg border border-border bg-bg-secondary">
        {channels.length === 0 ? (
          <div className="py-12 text-center">
            <Bell size={32} className="mx-auto mb-3 text-text-muted" />
            <p className="text-text-muted">No notification channels</p>
            <p className="text-sm text-text-muted mt-1">
              Create channels to receive alerts when monitors go down
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((ch) => {
              const plugin = plugins.find((p) => p.type === ch.type);
              return (
                <div key={ch.id} className="flex items-center gap-3 px-4 py-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{ch.name}</span>
                      <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-muted">
                        {plugin?.name || ch.type}
                      </span>
                      {!ch.isEnabled && (
                        <span className="rounded-full bg-status-down/10 px-2 py-0.5 text-[10px] font-medium text-status-down">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Global binding toggle */}
                  <button
                    onClick={() => toggleGlobalBinding(ch.id)}
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      isGloballyBound(ch.id)
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-muted hover:bg-bg-hover'
                    }`}
                    title={isGloballyBound(ch.id) ? 'Remove from global' : 'Add to global notifications'}
                  >
                    <Zap size={12} className="inline mr-1" />
                    {isGloballyBound(ch.id) ? 'Global' : 'Enable'}
                  </button>

                  {/* Test */}
                  <button
                    onClick={() => handleTest(ch.id)}
                    disabled={testing === ch.id}
                    className="shrink-0 p-1.5 text-text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Send test"
                  >
                    {testing === ch.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube2 size={14} />}
                  </button>
                  <button
                    onClick={() => openEdit(ch)}
                    className="shrink-0 p-1.5 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(ch.id, ch.name)}
                    className="shrink-0 p-1.5 text-text-muted hover:text-status-down opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
