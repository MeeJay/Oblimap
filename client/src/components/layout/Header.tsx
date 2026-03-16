import { LogOut, Menu, Download, ArrowLeftRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useSocketStore } from '@/store/socketStore';
import { appConfigApi } from '@/api/appConfig.api';
import { ssoApi } from '@/api/sso.api';
import { Button } from '@/components/common/Button';
import { NotificationCenter } from './NotificationCenter';
import { TenantSwitcher } from './TenantSwitcher';
import { cn } from '@/utils/cn';

/** True when running inside the Oblimap native desktop app (gear overlay sets this). */
const isNativeApp = typeof window !== 'undefined' &&
  !!(window as Window & { __oblimap_is_native_app?: boolean }).__oblimap_is_native_app;

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { toggleSidebar, sidebarFloating } = useUiStore();
  const { status: socketStatus } = useSocketStore();
  const [obliguardUrl, setObliguardUrl] = useState<string | null>(null);
  const [obliviewUrl, setObliviewUrl]   = useState<string | null>(null);
  const [oblianceUrl, setOblianceUrl]   = useState<string | null>(null);
  const [, startSsoTransition] = useTransition();

  useEffect(() => {
    appConfigApi.getConfig()
      .then((cfg) => {
        // server returns camelCase keys for integration URLs
        setObliguardUrl((cfg.obliguardUrl as string | null) ?? null);
        setObliviewUrl((cfg.obliviewUrl  as string | null) ?? null);
        setOblianceUrl((cfg.oblianceUrl  as string | null) ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-4">
      <div className="flex items-center gap-3">
        {/* Logo — shown in the Header only when the sidebar is floating.
            In pinned mode the logo lives inside the sidebar itself. */}
        {sidebarFloating && (
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo.webp" alt="Oblimap" className="h-8 w-8 rounded-lg" />
            <span className="hidden text-lg font-semibold text-text-primary sm:block">Oblimap</span>
          </Link>
        )}

        {/* Mobile menu button */}
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary lg:hidden"
        >
          <Menu size={20} />
        </button>

        {/* Tenant switcher — hidden when single-tenant (tenants.length <= 1) */}
        <TenantSwitcher />

        {/* Cross-app switch buttons — hidden inside the native Obli.tools desktop app */}
        {obliguardUrl && !isNativeApp && (
          <button
            type="button"
            onClick={() => {
              startSsoTransition(() => {
                ssoApi.generateSwitchToken()
                  .then((token) => {
                    const from = window.location.origin;
                    window.location.href = `${obliguardUrl}/auth/foreign?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&source=oblimap`;
                  })
                  .catch(() => { window.location.href = obliguardUrl; });
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
        {obliviewUrl && !isNativeApp && (
          <button
            type="button"
            onClick={() => {
              startSsoTransition(() => {
                ssoApi.generateSwitchToken()
                  .then((token) => {
                    const from = window.location.origin;
                    window.location.href = `${obliviewUrl}/auth/foreign?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&source=oblimap`;
                  })
                  .catch(() => { window.location.href = obliviewUrl; });
              });
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-all
              text-[#58a6ff] bg-[#0c1929]/40 border-[#1d4ed8]/50
              hover:text-white hover:bg-[#0c1929]/60 hover:border-[#3b82f6]"
          >
            <ArrowLeftRight size={12} />
            Obliview
          </button>
        )}
        {oblianceUrl && !isNativeApp && (
          <button
            type="button"
            onClick={() => {
              startSsoTransition(() => {
                ssoApi.generateSwitchToken()
                  .then((token) => {
                    const from = window.location.origin;
                    window.location.href = `${oblianceUrl}/auth/foreign?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}&source=oblimap`;
                  })
                  .catch(() => { window.location.href = oblianceUrl; });
              });
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition-all
              text-[#a78bfa] bg-[#2e1065]/40 border-[#7c3aed]/50
              hover:text-white hover:bg-[#2e1065]/60 hover:border-[#8b5cf6]"
          >
            <ArrowLeftRight size={12} />
            Obliance
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Download App link — hidden inside the native desktop app */}
        {!isNativeApp && (
          <Link
            to="/download"
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Download size={14} />
            {t('nav.downloadApp')}
          </Link>
        )}

        {/* Socket connection status dot */}
        <button
          onClick={socketStatus !== 'connected' ? () => window.location.reload() : undefined}
          title={
            socketStatus === 'connected'    ? t('header.socketConnected')    :
            socketStatus === 'reconnecting' ? t('header.socketReconnecting') :
                                              t('header.socketDisconnected')
          }
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full transition-opacity',
            socketStatus !== 'connected' && 'cursor-pointer hover:opacity-70',
            socketStatus === 'connected'  && 'cursor-default',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              socketStatus === 'connected'    && 'bg-green-500',
              socketStatus === 'reconnecting' && 'bg-amber-400 animate-pulse',
              socketStatus === 'disconnected' && 'bg-red-500 animate-pulse',
            )}
          />
        </button>

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
