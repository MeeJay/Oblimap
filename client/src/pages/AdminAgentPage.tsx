import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Key,
  Cpu,
  Monitor,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { AgentApiKey, AgentDevice, MonitorGroup } from '@obliview/shared';
import { agentApi } from '@/api/agent.api';
import { groupsApi } from '@/api/groups.api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import toast from 'react-hot-toast';

type Tab = 'keys' | 'devices';
type DeviceStatusFilter = 'pending' | 'approved' | 'refused' | 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateKey(key: string) {
  return key.slice(0, 8) + '...' + key.slice(-4);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: AgentDevice['status']) {
  const styles: Record<AgentDevice['status'], { icon: React.ReactNode; label: string; cls: string }> = {
    pending: {
      icon: <Clock size={11} />,
      label: 'Pending',
      cls: 'bg-yellow-500/10 text-yellow-400',
    },
    approved: {
      icon: <CheckCircle size={11} />,
      label: 'Approved',
      cls: 'bg-status-up/10 text-status-up',
    },
    refused: {
      icon: <XCircle size={11} />,
      label: 'Refused',
      cls: 'bg-status-down/10 text-status-down',
    },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-status-up" /> : <Copy size={14} />}
    </button>
  );
}

// ── AddAgentModal ─────────────────────────────────────────────────────────────

function AddAgentModal({
  keys,
  agentVersion,
  onClose,
}: {
  keys: AgentApiKey[];
  agentVersion: string;
  onClose: () => void;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set(keys.map(k => k.id)));

  const toggleKey = (id: number) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-bg-primary shadow-2xl overflow-y-auto max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Add Agent</h2>
            <p className="text-xs text-text-muted mt-0.5">Agent version: {agentVersion}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {keys.length === 0 ? (
            <div className="text-center py-8">
              <Key size={28} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-muted">Create an API Key first</p>
            </div>
          ) : (
            keys.map(apiKey => {
              const expanded = expandedKeys.has(apiKey.id);
              const linuxCmd = agentApi.getInstallerLinuxUrl(apiKey.key);
              const msiUrl = agentApi.getMsiUrl();
              const origin = window.location.origin;
              const linuxOneliner = `curl -fsSL "${linuxCmd}" | bash`;
              const windowsCmd = `$m="$env:TEMP\\obliview-agent.msi"; irm "${msiUrl}" -OutFile $m; msiexec /i $m SERVERURL="${origin}" APIKEY="${apiKey.key}" /quiet; Remove-Item $m`;

              return (
                <div key={apiKey.id} className="rounded-lg border border-border bg-bg-secondary">
                  <button
                    onClick={() => toggleKey(apiKey.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                  >
                    {expanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
                    <Key size={14} className="text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-text-primary">{apiKey.name}</span>
                      <span className="ml-2 text-xs font-mono text-text-muted">{truncateKey(apiKey.key)}</span>
                    </div>
                    {apiKey.deviceCount !== undefined && (
                      <span className="text-xs text-text-muted shrink-0">{apiKey.deviceCount} device{apiKey.deviceCount !== 1 ? 's' : ''}</span>
                    )}
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border">
                      {/* Linux */}
                      <div>
                        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 mt-3">Linux / macOS</p>
                        <div className="flex items-start gap-2 rounded-md bg-bg-tertiary p-3">
                          <code className="flex-1 text-xs font-mono text-text-primary break-all leading-relaxed">
                            {linuxOneliner}
                          </code>
                          <CopyButton text={linuxOneliner} />
                        </div>
                      </div>

                      {/* Windows */}
                      <div>
                        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Windows (PowerShell)</p>
                        <div className="flex items-start gap-2 rounded-md bg-bg-tertiary p-3">
                          <code className="flex-1 text-xs font-mono text-text-primary break-all leading-relaxed">
                            {windowsCmd}
                          </code>
                          <CopyButton text={windowsCmd} />
                        </div>
                        <p className="text-xs text-text-muted mt-1.5 px-1">
                          Télécharge et installe le MSI — UAC s'élève automatiquement.
                          Pas d'antivirus déclenché (pas de script PowerShell exécuté).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 pb-6">
          <Button variant="secondary" onClick={onClose} className="w-full">Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── ApproveModal ──────────────────────────────────────────────────────────────

function ApproveModal({
  device,
  groups,
  onApprove,
  onCancel,
}: {
  device: AgentDevice;
  groups: MonitorGroup[];
  onApprove: (groupId: number | null) => void;
  onCancel: () => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-primary shadow-2xl p-6">
        <h2 className="text-base font-semibold text-text-primary mb-1">Approve Device</h2>
        <p className="text-sm text-text-muted mb-4">
          Approve <span className="font-medium text-text-primary">{device.hostname}</span> and create its monitors?
        </p>

        <div className="space-y-1 mb-4">
          <label className="block text-sm font-medium text-text-secondary">Assign to Group (optional)</label>
          <select
            value={selectedGroupId ?? ''}
            onChange={e => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">— No group —</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => onApprove(selectedGroupId)} className="flex-1">
            <CheckCircle size={14} className="mr-1.5" />Approve
          </Button>
          <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminAgentPage() {
  const [tab, setTab] = useState<Tab>('devices');
  const [deviceFilter, setDeviceFilter] = useState<DeviceStatusFilter>('pending');

  const [keys, setKeys] = useState<AgentApiKey[]>([]);
  const [devices, setDevices] = useState<AgentDevice[]>([]);
  const [groups, setGroups] = useState<MonitorGroup[]>([]);
  const [agentVersion, setAgentVersion] = useState('1.0.0');

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [saving, setSaving] = useState(false);

  const [approvingDevice, setApprovingDevice] = useState<AgentDevice | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [k, d, v] = await Promise.all([
        agentApi.listKeys(),
        agentApi.listDevices(),
        agentApi.getVersion().catch(() => ({ version: '1.0.0', downloadUrl: '' })),
      ]);
      setKeys(k);
      setDevices(d);
      setAgentVersion(v.version);
    } catch {
      toast.error('Failed to load agent data');
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const tree = await groupsApi.tree();
      // Flatten tree to flat list
      const flat: MonitorGroup[] = [];
      const flatten = (nodes: typeof tree) => {
        for (const n of nodes) {
          flat.push(n);
          flatten(n.children);
        }
      };
      flatten(tree);
      setGroups(flat);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadGroups();
  }, [loadAll, loadGroups]);

  const filteredDevices = deviceFilter === 'all'
    ? devices
    : devices.filter(d => d.status === deviceFilter);

  const pendingCount = devices.filter(d => d.status === 'pending').length;

  // ── Key actions ────────────────────────────────────────────

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setSaving(true);
    try {
      await agentApi.createKey(newKeyName.trim());
      toast.success('API Key created');
      setNewKeyName('');
      setShowCreateKey(false);
      loadAll();
    } catch {
      toast.error('Failed to create key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (key: AgentApiKey) => {
    if (!confirm(`Delete key "${key.name}"? Devices using this key will stop pushing.`)) return;
    try {
      await agentApi.deleteKey(key.id);
      toast.success('Key deleted');
      loadAll();
    } catch {
      toast.error('Failed to delete key');
    }
  };

  // ── Device actions ─────────────────────────────────────────

  const handleApprove = async (groupId: number | null) => {
    if (!approvingDevice) return;
    try {
      await agentApi.updateDevice(approvingDevice.id, { status: 'approved', groupId });
      toast.success(`${approvingDevice.hostname} approved — monitors created`);
      setApprovingDevice(null);
      loadAll();
    } catch {
      toast.error('Failed to approve device');
    }
  };

  const handleRefuse = async (device: AgentDevice) => {
    if (!confirm(`Refuse device "${device.hostname}"? It will enter backoff mode.`)) return;
    try {
      await agentApi.updateDevice(device.id, { status: 'refused' });
      toast.success('Device refused');
      loadAll();
    } catch {
      toast.error('Failed to refuse device');
    }
  };

  const handleReinstate = async (device: AgentDevice) => {
    try {
      await agentApi.updateDevice(device.id, { status: 'pending' });
      toast.success('Device reinstated to pending');
      loadAll();
    } catch {
      toast.error('Failed to reinstate device');
    }
  };

  const handleDeleteDevice = async (device: AgentDevice) => {
    if (!confirm(`Delete device "${device.hostname}" and all its monitors?`)) return;
    try {
      await agentApi.deleteDevice(device.id);
      toast.success('Device deleted');
      loadAll();
    } catch {
      toast.error('Failed to delete device');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Cpu size={20} className="text-accent" />
          <h1 className="text-xl font-semibold text-text-primary">Agents</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <Button onClick={() => setShowAddAgent(true)}>
            <Plus size={14} className="mr-1.5" />Add Agent
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 rounded-lg bg-bg-secondary p-1 border border-border w-fit">
        <button
          onClick={() => setTab('devices')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'devices' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Monitor size={13} className="inline mr-1.5" />
          Devices
          {pendingCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-yellow-500 text-white text-[10px] font-bold">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('keys')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'keys' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Key size={13} className="inline mr-1.5" />
          API Keys
        </button>
      </div>

      {/* ── Devices Tab ── */}
      {tab === 'devices' && (
        <>
          {/* Status filter */}
          <div className="flex gap-1 mb-4">
            {(['pending', 'approved', 'refused', 'all'] as DeviceStatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDeviceFilter(f)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors capitalize ${
                  deviceFilter === f
                    ? 'bg-bg-tertiary text-text-primary font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {f}
                {f !== 'all' && (
                  <span className="ml-1.5 text-xs text-text-muted">
                    ({devices.filter(d => d.status === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Devices table */}
          <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
            {filteredDevices.length === 0 ? (
              <div className="py-12 text-center">
                <Cpu size={32} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm text-text-muted">
                  {deviceFilter === 'pending' ? 'No devices waiting for approval' : `No ${deviceFilter} devices`}
                </p>
                {deviceFilter === 'pending' && (
                  <p className="text-xs text-text-muted mt-1">
                    Click "Add Agent" to get the installation command
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-tertiary">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">Hostname</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">IP</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">OS</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">Agent</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted uppercase tracking-wide">Registered</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDevices.map(device => (
                    <tr key={device.id} className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-text-primary">{device.hostname}</span>
                        <div className="text-[10px] text-text-muted font-mono mt-0.5">{device.uuid.slice(0, 12)}…</div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{device.ip ?? '—'}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {device.osInfo
                          ? `${device.osInfo.distro ?? device.osInfo.platform} ${device.osInfo.release ?? ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-text-muted">{device.agentVersion ?? '—'}</td>
                      <td className="px-4 py-3">{statusBadge(device.status)}</td>
                      <td className="px-4 py-3 text-text-muted text-xs">{formatDate(device.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {device.status === 'pending' && (
                            <>
                              <Button size="sm" onClick={() => setApprovingDevice(device)}>
                                <CheckCircle size={12} className="mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => handleRefuse(device)}>
                                Refuse
                              </Button>
                            </>
                          )}
                          {device.status === 'refused' && (
                            <Button size="sm" variant="secondary" onClick={() => handleReinstate(device)}>
                              Reinstate
                            </Button>
                          )}
                          <button
                            onClick={() => handleDeleteDevice(device)}
                            className="p-1.5 rounded text-text-muted hover:text-status-down hover:bg-status-down/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── API Keys Tab ── */}
      {tab === 'keys' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">API Keys are used to authenticate agents during installation.</p>
            <Button size="sm" onClick={() => setShowCreateKey(true)}>
              <Plus size={13} className="mr-1" />New Key
            </Button>
          </div>

          {/* Create key form */}
          {showCreateKey && (
            <div className="mb-4 rounded-lg border border-border bg-bg-secondary p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">New API Key</h3>
              <div className="flex gap-2">
                <Input
                  placeholder="Key name (e.g. Production Servers)"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateKey()}
                  autoFocus
                />
                <Button onClick={handleCreateKey} loading={saving} disabled={!newKeyName.trim()}>
                  Create
                </Button>
                <Button variant="secondary" onClick={() => { setShowCreateKey(false); setNewKeyName(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Keys list */}
          <div className="rounded-lg border border-border bg-bg-secondary divide-y divide-border">
            {keys.length === 0 ? (
              <div className="py-10 text-center">
                <Key size={28} className="mx-auto mb-2 text-text-muted" />
                <p className="text-sm text-text-muted">No API keys yet</p>
              </div>
            ) : (
              keys.map(key => (
                <div key={key.id} className="flex items-center gap-3 px-4 py-3 group">
                  <Key size={14} className="shrink-0 text-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary text-sm">{key.name}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-mono text-text-muted">{truncateKey(key.key)}</span>
                      <CopyButton text={key.key} />
                      {key.deviceCount !== undefined && (
                        <span className="text-xs text-text-muted">{key.deviceCount} device{key.deviceCount !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted shrink-0 text-right">
                    <div>Created {formatDate(key.createdAt)}</div>
                    {key.lastUsedAt && <div>Last used {formatDate(key.lastUsedAt)}</div>}
                  </div>
                  <button
                    onClick={() => handleDeleteKey(key)}
                    className="shrink-0 p-1.5 rounded text-text-muted hover:text-status-down hover:bg-status-down/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showAddAgent && (
        <AddAgentModal
          keys={keys}
          agentVersion={agentVersion}
          onClose={() => setShowAddAgent(false)}
        />
      )}

      {approvingDevice && (
        <ApproveModal
          device={approvingDevice}
          groups={groups}
          onApprove={handleApprove}
          onCancel={() => setApprovingDevice(null)}
        />
      )}
    </div>
  );
}
