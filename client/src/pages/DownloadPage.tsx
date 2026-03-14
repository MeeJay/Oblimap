import { useState, useEffect } from 'react';
import {
  Monitor, Apple, Download, ExternalLink, FolderOpen,
  Loader2, CheckCircle, AlertCircle, Radar, Server, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

// ── Native desktop-app Go bindings ───────────────────────────────────────────
// These are injected by the Go overlay into window when running inside Oblimap.

type NativeWindow = Window & {
  __oblimap_is_native_app?: boolean;
  /** Returns the currently saved download folder, or "" if not yet set. */
  __go_getDownloadDir?: () => Promise<string>;
  /** Opens a native OS folder-picker, saves the choice, returns the path. Rejects on cancel. */
  __go_chooseDownloadDir?: () => Promise<string>;
  /** Downloads relUrl from the Oblimap server to the saved folder (opens picker if unset). Returns the full path. */
  __go_downloadFile?: (relUrl: string, filename: string) => Promise<string>;
};

const nw = typeof window !== 'undefined' ? (window as NativeWindow) : null;
const isNativeApp = !!nw?.__oblimap_is_native_app;

// ── Static data ───────────────────────────────────────────────────────────────

interface DownloadEntry {
  label: string;
  sublabel: string;
  filename: string;
  primary?: boolean;
}

interface Platform {
  name: string;
  icon: React.ReactNode;
  downloads: DownloadEntry[];
}

// ── Reusable download button ──────────────────────────────────────────────────

interface DownloadButtonProps {
  entry: DownloadEntry;
  relDir: string;   // e.g. '/downloads/' or '/downloads/probe/'
  downloading: Record<string, boolean>;
  downloaded: Record<string, string>;
  dlErrors: Record<string, string>;
  onNativeDownload: (relUrl: string, filename: string) => void;
}

function DownloadButton({
  entry: d, relDir,
  downloading, downloaded, dlErrors,
  onNativeDownload,
}: DownloadButtonProps) {
  const { t } = useTranslation();
  const isLoading = !!downloading[d.filename];
  const isSaved   = !!downloaded[d.filename];
  const hasError  = !!dlErrors[d.filename];

  const base      = 'flex flex-col items-center justify-center gap-1 rounded-lg px-3 py-5 text-center transition-colors disabled:opacity-60 w-full';
  const primary   = `${base} bg-accent font-semibold text-white hover:opacity-90`;
  const secondary = `${base} border border-border bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary`;

  const inner = isLoading ? (
    <>
      <Loader2 size={15} className="animate-spin" />
      <span className="text-xs mt-0.5">{t('common.downloading')}</span>
    </>
  ) : isSaved ? (
    <>
      <CheckCircle size={15} className={d.primary ? 'text-white/80' : 'text-green-400'} />
      <span className="text-xs mt-0.5">{t('common.saved')}</span>
    </>
  ) : (
    <>
      <Download size={15} />
      <span className="text-xs font-semibold leading-tight mt-0.5">{d.label}</span>
      <span className="text-xs leading-tight opacity-60">{d.sublabel}</span>
    </>
  );

  return (
    <div className="flex flex-col">
      {hasError && isNativeApp && (
        <div className="mb-1 flex items-center gap-1 text-xs text-red-400">
          <AlertCircle size={10} />
          <span className="truncate">{dlErrors[d.filename]}</span>
        </div>
      )}
      {isNativeApp ? (
        <button
          onClick={() => onNativeDownload(`${relDir}${d.filename}`, d.filename)}
          disabled={isLoading}
          className={d.primary ? primary : secondary}
        >
          {inner}
        </button>
      ) : (
        <a
          href={`${relDir}${d.filename}`}
          download={d.filename}
          className={d.primary ? primary : secondary}
        >
          {inner}
        </a>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'desktop' | 'probe';

export function DownloadPage() {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('desktop');

  const DESKTOP_PLATFORMS: Platform[] = [
    {
      name: t('download.windows'),
      icon: <Monitor size={24} />,
      downloads: [
        {
          label: t('download.installer'),
          sublabel: t('download.installerSub'),
          filename: 'OblimapSetup.msi',
          primary: true,
        },
        {
          label: t('download.portable'),
          sublabel: t('download.portableSub'),
          filename: 'Oblimap.exe',
        },
      ],
    },
    {
      name: t('download.macos'),
      icon: <Apple size={24} />,
      downloads: [
        {
          label: t('download.dmg'),
          sublabel: t('download.dmgSubArm'),
          filename: 'Oblimap-arm64.dmg',
          primary: true,
        },
        {
          label: t('download.dmg'),
          sublabel: t('download.dmgSubIntel'),
          filename: 'Oblimap-amd64.dmg',
          primary: true,
        },
        {
          label: t('download.zip'),
          sublabel: t('download.dmgSubArm'),
          filename: 'Oblimap-arm64.zip',
        },
        {
          label: t('download.zip'),
          sublabel: t('download.dmgSubIntel'),
          filename: 'Oblimap-amd64.zip',
        },
      ],
    },
  ];

  const PROBE_PLATFORMS: Platform[] = [
    {
      name: t('download.probe.linux'),
      icon: <Server size={24} />,
      downloads: [
        {
          label: 'Binary (.elf)',
          sublabel: t('download.probe.amd64Sub'),
          filename: 'oblimap-probe-linux-amd64',
          primary: true,
        },
        {
          label: 'Binary (.elf)',
          sublabel: t('download.probe.arm64Sub'),
          filename: 'oblimap-probe-linux-arm64',
        },
      ],
    },
    {
      name: t('download.probe.windows'),
      icon: <Monitor size={24} />,
      downloads: [
        {
          label: 'Executable (.exe)',
          sublabel: t('download.probe.windowsSub'),
          filename: 'oblimap-probe-windows-amd64.exe',
          primary: true,
        },
      ],
    },
    {
      name: t('download.probe.macos'),
      icon: <Apple size={24} />,
      downloads: [
        {
          label: 'Binary',
          sublabel: t('download.probe.macArmSub'),
          filename: 'oblimap-probe-darwin-arm64',
          primary: true,
        },
        {
          label: 'Binary',
          sublabel: t('download.probe.macIntelSub'),
          filename: 'oblimap-probe-darwin-amd64',
        },
      ],
    },
  ];

  // Native-app download folder state
  const [downloadDir, setDownloadDir] = useState<string>('');

  // Per-filename loading / success / error state
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloaded, setDownloaded]   = useState<Record<string, string>>({});
  const [dlErrors, setDlErrors]       = useState<Record<string, string>>({});

  // On mount, read the saved download folder from Go config.
  useEffect(() => {
    if (!isNativeApp || !nw?.__go_getDownloadDir) return;
    nw.__go_getDownloadDir()
      .then(dir => setDownloadDir(dir))
      .catch(() => {/* silently ignore */});
  }, []);

  const handleChangeDir = async () => {
    const go = nw?.__go_chooseDownloadDir;
    if (!go) return;
    try {
      const dir = await go();
      setDownloadDir(dir);
    } catch {
      // cancelled — silently ignore
    }
  };

  const handleNativeDownload = async (relUrl: string, filename: string) => {
    const go = nw?.__go_downloadFile;
    if (!go) return;

    setDownloading(prev => ({ ...prev, [filename]: true }));
    setDlErrors(prev => { const n = { ...prev }; delete n[filename]; return n; });

    try {
      const dest = await go(relUrl, filename);
      setDownloaded(prev => ({ ...prev, [filename]: dest }));
      // After 6 s reset the "Saved" badge so the button is usable again.
      setTimeout(() => {
        setDownloaded(prev => { const n = { ...prev }; delete n[filename]; return n; });
      }, 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'cancelled') {
        setDlErrors(prev => ({ ...prev, [filename]: msg }));
      }
      // If the user opened the folder picker and chose a new folder, update the displayed dir.
      if (nw?.__go_getDownloadDir) {
        nw.__go_getDownloadDir().then(dir => setDownloadDir(dir)).catch(() => {});
      }
    } finally {
      setDownloading(prev => { const n = { ...prev }; delete n[filename]; return n; });
    }
  };

  const btnProps = { downloading, downloaded, dlErrors, onNativeDownload: handleNativeDownload };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'desktop', label: t('download.tabDesktop'), icon: <Globe size={15} /> },
    { id: 'probe',   label: t('download.tabProbe'),   icon: <Radar size={15} /> },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Download size={32} />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-text-primary">{t('download.pageTitle')}</h1>
        <p className="text-text-secondary">{t('download.pageDesc')}</p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex rounded-xl border border-border bg-bg-secondary p-1 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Desktop App tab ─────────────────────────────────────────────── */}
      {activeTab === 'desktop' && (
        <>
          {/* Section header */}
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-text-primary mb-1">{t('download.title')}</h2>
            <p className="text-sm text-text-secondary whitespace-pre-line">{t('download.description')}</p>
          </div>

          {/* Download folder row — shown only inside the native app */}
          {isNativeApp && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm">
              <FolderOpen size={15} className="text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-text-secondary">{t('download.downloadFolder')}</span>
                {downloadDir
                  ? <span className="font-mono text-text-primary break-all">{downloadDir}</span>
                  : <span className="text-text-muted italic">{t('download.downloadFolderPlaceholder')}</span>
                }
              </div>
              <button
                onClick={handleChangeDir}
                className="shrink-0 rounded-md border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-hover transition-colors"
              >
                {t('download.changeFolder')}
              </button>
            </div>
          )}

          {/* Feature pills */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {[
              t('download.features.soundAlerts'),
              t('download.features.agentAlerts'),
              t('download.features.noBrowserOverhead'),
              t('download.features.remembersUrl'),
              t('download.features.alwaysUpToDate'),
            ].map((f) => (
              <span
                key={f}
                className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs text-text-secondary"
              >
                {f}
              </span>
            ))}
          </div>

          {/* Download cards */}
          <div className="flex flex-col gap-4">
            {DESKTOP_PLATFORMS.map((p) => (
              <div key={p.name} className="rounded-xl border border-border bg-bg-secondary p-5">
                <div className="mb-3 flex items-center gap-2.5 text-text-primary">
                  <span className="text-text-secondary">{p.icon}</span>
                  <span className="font-semibold">{p.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {p.downloads.map((d) => (
                    <DownloadButton key={d.filename} entry={d} relDir="/downloads/" {...btnProps} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Build from source */}
          <div className="mt-8 rounded-xl border border-border bg-bg-secondary p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ExternalLink size={14} />
              {t('download.buildFromSource')}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('download.buildFromSourceDesc')}{' '}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">desktop-app/</code>{' '}
              It is a Go application using the native OS webview (WebView2 on Windows, WKWebView on macOS).{' '}
              On Windows run{' '}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">.\build-windows.ps1</code>{' '}
              (requires WiX v4:{' '}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">dotnet tool install --global wix</code>).{' '}
              On macOS run{' '}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">./build-mac.sh</code>.
            </p>
          </div>

          {/* How it works */}
          <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
            <div className="mb-3 text-sm font-semibold text-text-primary">{t('download.howItWorks')}</div>
            <ul className="space-y-2 text-sm text-text-secondary">
              {(['step1','step2','step3','step4','step5'] as const).map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-accent">{i + 1}.</span>
                  {t(`download.${step}`)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* ── Probe tab ───────────────────────────────────────────────────── */}
      {activeTab === 'probe' && (
        <>
          {/* Section header */}
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-text-primary mb-1">{t('download.probe.title')}</h2>
            <p className="text-sm text-text-secondary">{t('download.probe.description')}</p>
          </div>

          {/* Feature pills */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {[
              t('download.probe.features.arpScan'),
              t('download.probe.features.autoDiscover'),
              t('download.probe.features.macTracking'),
              t('download.probe.features.vendorLookup'),
              t('download.probe.features.configurable'),
            ].map((f) => (
              <span
                key={f}
                className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs text-text-secondary"
              >
                {f}
              </span>
            ))}
          </div>

          {/* Probe download cards */}
          <div className="flex flex-col gap-4">
            {PROBE_PLATFORMS.map((p) => (
              <div key={p.name} className="rounded-xl border border-border bg-bg-secondary p-5">
                <div className="mb-3 flex items-center gap-2.5 text-text-primary">
                  <span className="text-text-secondary">{p.icon}</span>
                  <span className="font-semibold">{p.name}</span>
                </div>
                <div className={p.downloads.length === 1 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
                  {p.downloads.map((d) => (
                    <DownloadButton key={d.filename} entry={d} relDir="/downloads/probe/" {...btnProps} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Quick-start note */}
          <div className="mt-8 rounded-xl border border-border bg-bg-secondary p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Radar size={14} className="text-accent" />
              Quick start (Linux)
            </div>
            <pre className="overflow-x-auto rounded-lg bg-bg-tertiary p-3 text-xs font-mono text-text-primary leading-relaxed">
{`# 1. Download and make executable
chmod +x oblimap-probe-linux-amd64

# 2. Set your server URL and API key
export OBLIMAP_SERVER_URL=https://oblimap.example.com
export OBLIMAP_API_KEY=<key from admin panel>

# 3. Run
./oblimap-probe-linux-amd64`}
            </pre>
          </div>

          {/* Build from source */}
          <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ExternalLink size={14} />
              {t('download.probe.buildFromSource')}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('download.probe.buildFromSourceDesc')}{' '}
              <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">probe/</code>
            </p>
          </div>

          {/* How it works */}
          <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
            <div className="mb-3 text-sm font-semibold text-text-primary">{t('download.probe.howItWorks')}</div>
            <ul className="space-y-2 text-sm text-text-secondary">
              {(['step1','step2','step3','step4','step5'] as const).map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-accent">{i + 1}.</span>
                  {t(`download.probe.${step}`)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
