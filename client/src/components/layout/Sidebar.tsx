import { useCallback, useEffect, useState, useTransition } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  Bell,
  Users,
  Folder,
  MapPin,
  Radar,
  UserCircle,
  LogOut,
  ArrowLeftRight,
  PackageOpen,
  Building2,
  Database,
  ChevronDown,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { GroupTree } from '@/components/groups/GroupTree';
import { appConfigApi } from '@/api/appConfig.api';
import { ssoApi } from '@/api/sso.api';

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

// ── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  platformAdminOnly?: boolean;
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, isAdmin } = useAuthStore();

  const topNavItems: NavItem[] = [
    { label: t('nav.dashboard'), path: '/',            icon: <LayoutDashboard size={18} /> },
    { label: t('nav.sites'),     path: '/sites',        icon: <MapPin size={18} /> },
    { label: t('nav.groups'),    path: '/groups',       icon: <Folder size={18} />, adminOnly: true },
    { label: t('nav.probes'),    path: '/admin/probes', icon: <Radar size={18} />, adminOnly: true },
  ];

  const adminNavItems: NavItem[] = [
    { label: t('nav.users'),        path: '/admin/users',         icon: <Users size={18} />,      adminOnly: true },
    { label: t('tenant.pageTitle'), path: '/admin/tenants',       icon: <Building2 size={18} />,  adminOnly: true },
    { label: t('nav.macVendors'),   path: '/admin/mac-vendors',   icon: <Database size={18} />,   adminOnly: true },
    { label: t('nav.importExport'), path: '/admin/import-export', icon: <PackageOpen size={18} />, adminOnly: true },
  ];

  const bottomNavItems: NavItem[] = [
    { label: t('nav.notifications'), path: '/notifications', icon: <Bell size={18} />, adminOnly: true },
    { label: t('nav.settings'),      path: '/settings',      icon: <Settings size={18} />, adminOnly: true },
  ];

  const { sidebarFloating, toggleSidebarFloating } = useUiStore();

  const [obliguardUrl, setObliguardUrl] = useState<string | null>(null);
  const [, startSsoTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [adminMenuOpen, setAdminMenuOpen] = usePersisted<boolean>('sidebar:admin-open', true);

  const admin = isAdmin();

  // Load Obliguard URL from config (for the switch button)
  useEffect(() => {
    appConfigApi.getConfig()
      .then((cfg) => setObliguardUrl((cfg.obliguard_url as string | null) ?? null))
      .catch(() => {});
  }, []);

  const renderNavLink = (item: NavItem) => {
    if (item.adminOnly && !admin) return null;
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
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-bg-secondary">
      {/* Logo + float/pin toggle */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.webp" alt="Oblimap" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold text-text-primary">Oblimap</span>
        </Link>
        <div className="flex items-center gap-1">
          {obliguardUrl && !sidebarFloating && (
            <button
              type="button"
              onClick={() => {
                startSsoTransition(() => {
                  ssoApi.generateSwitchToken()
                    .then((token) => {
                      const from = window.location.origin;
                      window.location.href = `${obliguardUrl}/auth/foreign?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&source=oblimap`;
                    })
                    .catch(() => {
                      window.location.href = obliguardUrl;
                    });
                });
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-all
                text-[#fb923c] bg-[#431407]/40 border-[#c2410c]/50
                hover:text-white hover:bg-[#431407]/60 hover:border-[#ea580c]"
            >
              <ArrowLeftRight size={12} />
              Obliguard
            </button>
          )}
          <button
            onClick={toggleSidebarFloating}
            title={sidebarFloating ? t('nav.pinSidebar') : t('nav.floatSidebar')}
            className={cn(
              'p-1.5 rounded transition-colors',
              sidebarFloating
                ? 'text-accent hover:text-accent hover:bg-accent/10'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover',
            )}
          >
            {sidebarFloating ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <input
          type="text"
          placeholder={t('common.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Main nav */}
      <nav className="px-2 pb-1">
        {topNavItems.map(renderNavLink)}
      </nav>

      {/* Group tree — shows group hierarchy for navigating to sites within groups */}
      <div className="flex-1 overflow-y-auto px-2 min-h-0">
        <GroupTree searchQuery={search} />
      </div>

      {/* Admin section collapsible */}
      {admin && (
        <>
          <button
            onClick={() => setAdminMenuOpen(v => !v)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-text-muted hover:text-text-secondary transition-colors"
          >
            <div className="flex-1 h-px bg-border" />
            <ChevronDown size={12} className={cn('transition-transform duration-200', !adminMenuOpen && '-rotate-90')} />
            <div className="flex-1 h-px bg-border" />
          </button>

          {adminMenuOpen && (
            <nav className="px-2 pb-1">
              {adminNavItems.map(renderNavLink)}
            </nav>
          )}
        </>
      )}

      {/* Bottom nav (notifications, settings) */}
      <nav className="border-t border-border p-2 pb-0">
        {bottomNavItems.map(renderNavLink)}
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
          {t('nav.signOut')}
        </button>
      </div>
    </aside>
  );
}
