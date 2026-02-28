import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  LayoutDashboard,
  Settings,
  Bell,
  Users,
  FolderTree,
  Plus,
  UserCircle,
  LogOut,
  Cpu,
  Server,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import { useMonitorStore } from '@/store/monitorStore';
import { useGroupStore } from '@/store/groupStore';
import { GroupTree } from '@/components/groups/GroupTree';
import { agentApi } from '@/api/agent.api';
import type { AgentDevice, MonitorStatus } from '@obliview/shared';
import toast from 'react-hot-toast';

// ── localStorage helpers ─────────────────────────────────────────────────────

function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);
  return [value, set];
}

// ── Status dot ───────────────────────────────────────────────────────────────

function AgentStatusDot({ status }: { status: MonitorStatus | 'suspended' | undefined }) {
  const colorMap: Record<string, string> = {
    up:       'bg-green-500',
    down:     'bg-red-500',
    alert:    'bg-orange-500',
    inactive: 'bg-gray-400',
    paused:   'bg-gray-500',
    suspended:'bg-gray-500',
    pending:  'bg-yellow-500',
    ssl_warning: 'bg-yellow-400',
    ssl_expired: 'bg-red-500',
  };
  const cls = colorMap[status ?? ''] ?? 'bg-gray-400';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

// ── Draggable Agent Device Item ───────────────────────────────────────────────

function DraggableDeviceItem({
  device,
  monitorStatus,
  indent = false,
}: {
  device: AgentDevice;
  monitorStatus: MonitorStatus | undefined;
  indent?: boolean;
}) {
  const location = useLocation();
  const isActive = location.pathname === `/agents/${device.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `agent-device-${device.id}`,
    data: { type: 'agent-device', device },
  });

  const displayName = device.name ?? device.hostname;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, paddingLeft: indent ? '24px' : undefined }}
    >
      <Link
        to={`/agents/${device.id}`}
        className={cn(
          'flex items-center gap-2 rounded-md py-1 text-sm transition-colors',
          indent ? '' : 'px-2',
          isActive
            ? 'bg-bg-active text-text-primary'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        )}
        onClick={e => {
          // Prevent navigation when dragging
          if (isDragging) e.preventDefault();
        }}
      >
        <AgentStatusDot status={device.status === 'suspended' ? 'suspended' : monitorStatus} />
        <span className="truncate flex-1 text-xs">{displayName}</span>
      </Link>
    </div>
  );
}

// ── Droppable Group Header ─────────────────────────────────────────────────────

function DroppableGroupHeader({
  groupId,
  children,
}: {
  groupId: number | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: groupId === null ? 'drop-agent-ungrouped' : `drop-agent-group-${groupId}`,
    data: { type: 'agent-group', groupId },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md transition-colors',
        isOver && 'ring-1 ring-accent bg-accent/10',
      )}
    >
      {children}
    </div>
  );
}

// ── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} /> },
  { label: 'Groups', path: '/groups', icon: <FolderTree size={18} />, adminOnly: true },
  { label: 'Notifications', path: '/notifications', icon: <Bell size={18} />, adminOnly: true },
  { label: 'Users', path: '/admin/users', icon: <Users size={18} />, adminOnly: true },
  { label: 'Agents', path: '/admin/agents', icon: <Cpu size={18} />, adminOnly: true },
  { label: 'Settings', path: '/settings', icon: <Settings size={18} />, adminOnly: true },
];

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const location = useLocation();
  const { user, isAdmin, canCreate } = useAuthStore();
  const { fetchMonitors, monitors } = useMonitorStore();
  const { tree } = useGroupStore();

  const [approvedDevices, setApprovedDevices] = useState<AgentDevice[]>([]);

  // Layout preferences
  const [sidebarLayout, setSidebarLayout] = usePersisted<'stacked' | 'side-by-side'>('sidebar-layout', 'stacked');
  const [showMonitors, setShowMonitors] = usePersisted<boolean>('sidebar-show-monitors', true);
  const [showAgents, setShowAgents] = usePersisted<boolean>('sidebar-show-agents', true);

  // Agent groups (kind='agent')
  const agentGroups = tree.filter(n => n.kind === 'agent');
  const admin = isAdmin();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  // Fetch approved+suspended devices for sidebar (admin only)
  const loadDevices = useCallback(() => {
    if (!admin) return;
    Promise.all([
      agentApi.listDevices('approved'),
      agentApi.listDevices('suspended'),
    ])
      .then(([approved, suspended]) => setApprovedDevices([...approved, ...suspended]))
      .catch(() => {});
  }, [admin]);

  useEffect(() => {
    loadDevices();
    const id = setInterval(loadDevices, 30000);
    return () => clearInterval(id);
  }, [loadDevices]);

  /** Get the monitor status for an agent device */
  const getMonitorStatus = useCallback(
    (deviceId: number): MonitorStatus | undefined => {
      for (const m of monitors.values()) {
        if (m.agentDeviceId === deviceId) return m.status;
      }
      return undefined;
    },
    [monitors],
  );

  const handleAgentDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const dragData = active.data.current;
      const dropData = over.data.current;

      if (dragData?.type !== 'agent-device' || dropData?.type !== 'agent-group') return;

      const device = dragData.device as AgentDevice;
      const targetGroupId = dropData.groupId as number | null;

      if (device.groupId === targetGroupId) return;

      try {
        await agentApi.updateDevice(device.id, { groupId: targetGroupId });
        loadDevices();
        toast.success('Agent moved');
      } catch {
        toast.error('Failed to move agent');
      }
    },
    [loadDevices],
  );

  // ── Agent section render helper ──────────────────────────────────────────
  const agentSection = admin ? (
    <DndContext sensors={sensors} onDragEnd={handleAgentDragEnd}>
      <div className="mt-2 pt-2 border-t border-border">
        <div className="px-2 py-1 flex items-center gap-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
          <Server size={12} />
          Agent Groups
        </div>

        {/* Grouped devices */}
        {agentGroups.map(group => {
          const isGroupActive = location.pathname === `/group/${group.id}`;
          const groupDevices = approvedDevices.filter(d => d.groupId === group.id);
          return (
            <DroppableGroupHeader key={group.id} groupId={group.id}>
              <Link
                to={`/group/${group.id}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors',
                  isGroupActive
                    ? 'bg-bg-active text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                )}
              >
                <Server size={14} className="shrink-0 text-text-muted" />
                <span className="truncate flex-1">{group.name}</span>
                {groupDevices.length > 0 && (
                  <span className="text-xs text-text-muted">{groupDevices.length}</span>
                )}
              </Link>
              {groupDevices.map(device => (
                <DraggableDeviceItem
                  key={device.id}
                  device={device}
                  monitorStatus={getMonitorStatus(device.id)}
                  indent
                />
              ))}
            </DroppableGroupHeader>
          );
        })}

        {/* Ungrouped devices */}
        {approvedDevices.filter(d => d.groupId === null).length > 0 && (
          <DroppableGroupHeader groupId={null}>
            {approvedDevices.filter(d => d.groupId === null).map(device => (
              <DraggableDeviceItem
                key={device.id}
                device={device}
                monitorStatus={getMonitorStatus(device.id)}
              />
            ))}
          </DroppableGroupHeader>
        )}
      </div>
    </DndContext>
  ) : null;

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-bg-secondary">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.webp" alt="Obliview" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold text-text-primary">Obliview</span>
        </Link>
      </div>

      {/* Add Monitor button */}
      {canCreate() && (
        <div className="px-3 pt-3">
          <Link
            to="/monitor/new"
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            <Plus size={14} />
            Add Monitor
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-3">
        <input
          type="text"
          placeholder="Search monitors..."
          className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Filter chips + layout toggle (admin only, shown when there are agent groups) */}
      {admin && agentGroups.length > 0 && (
        <div className="flex items-center justify-between px-3 pb-1.5 gap-2">
          {/* Filter chips */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowMonitors(v => !v)}
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border transition-colors',
                showMonitors
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
            >
              Monitors
            </button>
            <button
              onClick={() => setShowAgents(v => !v)}
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border transition-colors',
                showAgents
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border text-text-muted hover:text-text-secondary',
              )}
            >
              Agents
            </button>
          </div>
          {/* Layout toggle */}
          <button
            onClick={() => setSidebarLayout(l => l === 'stacked' ? 'side-by-side' : 'stacked')}
            title={sidebarLayout === 'stacked' ? 'Switch to side-by-side' : 'Switch to stacked'}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors shrink-0"
          >
            <ArrowLeftRight size={13} />
          </button>
        </div>
      )}

      {/* Content area — stacked or side-by-side */}
      {sidebarLayout === 'side-by-side' && showMonitors && showAgents && admin && agentGroups.length > 0 ? (
        <div className="flex flex-row flex-1 overflow-hidden min-h-0">
          {/* Monitors column */}
          <div className="flex-1 overflow-y-auto px-2 border-r border-border min-w-0">
            <GroupTree />
          </div>
          {/* Agents column */}
          <div className="flex-1 overflow-y-auto px-2 min-w-0">
            {agentSection}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2">
          {showMonitors && <GroupTree />}
          {showAgents && agentSection}
        </div>
      )}

      {/* Navigation */}
      <nav className="border-t border-border p-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin())
          .map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-bg-active text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-2">
        <Link
          to="/profile"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            location.pathname === '/profile'
              ? 'bg-bg-active text-text-primary'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
          )}
        >
          <UserCircle size={18} />
          <span className="truncate flex-1">{user?.displayName || user?.username}</span>
        </Link>
        <button
          onClick={() => {
            useAuthStore.getState().logout();
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
