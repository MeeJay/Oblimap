import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import { useMonitorStore } from '@/store/monitorStore';
import { GroupTree } from '@/components/groups/GroupTree';

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

export function Sidebar() {
  const location = useLocation();
  const { user, isAdmin, canCreate } = useAuthStore();
  const { fetchMonitors } = useMonitorStore();

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-bg-secondary">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.webp" alt="Obliview" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold text-text-primary">Obliview</span>
        </Link>
      </div>

      {/* Add Monitor button (users with create permission) */}
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

      {/* Monitor/Group tree */}
      <div className="flex-1 overflow-y-auto px-2">
        <GroupTree />
      </div>

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
