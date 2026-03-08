import { LogOut, Menu, Download, PanelLeft, PanelLeftClose } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/common/Button';
import { NotificationCenter } from './NotificationCenter';
import { TenantSwitcher } from './TenantSwitcher';
import { cn } from '@/utils/cn';

/** True when running inside the Obliview native desktop app (gear overlay sets this). */
const isNativeApp = typeof window !== 'undefined' &&
  !!(window as Window & { __obliview_is_native_app?: boolean }).__obliview_is_native_app;

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { toggleSidebar, sidebarFloating, toggleSidebarFloating } = useUiStore();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-4">
      <div className="flex items-center gap-3">
        {/* Logo — always visible regardless of sidebar state.
            This ensures it's never hidden behind the native desktop app tab bar. */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo.webp" alt="Obliview" className="h-8 w-8 rounded-lg" />
          <span className="hidden text-lg font-semibold text-text-primary sm:block">Obliview</span>
        </Link>

        {/* Mobile menu button */}
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary lg:hidden"
        >
          <Menu size={20} />
        </button>

        {/* Tenant switcher — hidden when single-tenant (tenants.length <= 1) */}
        <TenantSwitcher />
      </div>

      <div className="flex items-center gap-2">
        {/* Float / Pin sidebar toggle — moved here from the sidebar header so it stays
            accessible when the sidebar is floating and the desktop app native tab bar
            would otherwise cover the sidebar's top section. */}
        <button
          onClick={toggleSidebarFloating}
          title={sidebarFloating ? t('nav.pinSidebar') : t('nav.floatSidebar')}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            sidebarFloating
              ? 'text-accent hover:bg-accent/10'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-primary',
          )}
        >
          {sidebarFloating ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* Download App link — hidden inside the native desktop app */}
        {!isNativeApp && (
          <Link
            to="/download"
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors px-2"
          >
            <Download size={14} />
            {t('nav.downloadApp')}
          </Link>
        )}

        {/* Notification Center */}
        <NotificationCenter />

        {user && (
          <>
            <div className="text-sm">
              <span className="text-text-secondary">{t('header.signedInAs')} </span>
              <span className="font-medium text-text-primary">{user.username}</span>
              <span className="ml-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-muted">
                {user.role}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title={t('nav.signOut')}
            >
              <LogOut size={16} />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
