import { useState, useEffect } from 'react';
import { Monitor, Apple, Download, ExternalLink, FolderOpen, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

// ── Native desktop-app Go bindings ───────────────────────────────────────────
// These are injected by the Go overlay into window when running inside Obliview.

type NativeWindow = Window & {
  __obliview_is_native_app?: boolean;
  /** Returns the currently saved download folder, or "" if not yet set. */
  __go_getDownloadDir?: () => Promise<string>;
  /** Opens a native OS folder-picker, saves the choice, returns the path. Rejects on cancel. */
  __go_chooseDownloadDir?: () => Promise<string>;
  /** Downloads relUrl from the Obliview server to the saved folder (opens picker if unset). Returns the full path. */
  __go_downloadFile?: (relUrl: string, filename: string) => Promise<string>;
};

const nw = typeof window !== 'undefined' ? (window as NativeWindow) : null;
const isNativeApp = !!nw?.__obliview_is_native_app;

// ── Static data ───────────────────────────────────────────────────────────────

interface DownloadEntry {
  label: string;
  filename: string;
  primary?: boolean;
  note?: string;
}

interface Platform {
  name: string;
  icon: React.ReactNode;
  description: string;
  downloads: DownloadEntry[];
}

const PLATFORMS: Platform[] = [
  {
    name: 'Windows',
    icon: <Monitor size={28} />,
    description: 'Windows 10 / 11 (64-bit)',
    downloads: [
      {
        label: 'Installer (.msi)',
        filename: 'ObliviewSetup.msi',
        primary: true,
        note: 'Installs to Program Files with a Start Menu shortcut. Recommended.',
      },
      {
        label: 'Portable (.exe)',
        filename: 'Obliview.exe',
        note: 'Single executable — no installation needed. Requires WebView2 (built into Windows 10 1803+ / Edge Chromium).',
      },
    ],
  },
  {
    name: 'macOS',
    icon: <Apple size={28} />,
    description: 'macOS 10.13 or later',
    downloads: [
      {
        label: 'Disk Image (.dmg)',
        filename: 'Obliview.dmg',
        primary: true,
        note: 'Open the DMG and drag Obliview to Applications. Right-click → Open on first launch (Gatekeeper).',
      },
      {
        label: 'Zip archive (.zip)',
        filename: 'Obliview.zip',
        note: 'Extract and move Obliview.app to Applications manually.',
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function DownloadPage() {
  // Native-app download folder state
  const [downloadDir, setDownloadDir] = useState<string>('');

  // Per-filename loading / success / error state
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloaded, setDownloaded] = useState<Record<string, string>>({});  // filename → saved path
  const [dlErrors, setDlErrors] = useState<Record<string, string>>({});

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Download size={32} />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-text-primary">Obliview Desktop</h1>
        <p className="text-text-secondary">
          A lightweight native wrapper for your Obliview instance.
          Get system-level sound notifications and a distraction-free monitoring experience.
        </p>
      </div>

      {/* Download folder row — shown only inside the native app */}
      {isNativeApp && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm">
          <FolderOpen size={15} className="text-text-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-text-secondary">Download folder: </span>
            {downloadDir
              ? <span className="font-mono text-text-primary break-all">{downloadDir}</span>
              : <span className="text-text-muted italic">Will ask on first download</span>
            }
          </div>
          <button
            onClick={handleChangeDir}
            className="shrink-0 rounded-md border border-border px-3 py-1 text-xs text-text-secondary hover:bg-bg-hover transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Feature pills */}
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        {[
          'Sound alerts for probe down / recovery',
          'Agent threshold notifications',
          'No browser overhead',
          'Remembers your server URL',
          'Always up-to-date — no rebuilds needed',
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
      <div className="grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((p) => (
          <div
            key={p.name}
            className="flex flex-col rounded-xl border border-border bg-bg-secondary p-6"
          >
            <div className="mb-4 flex items-center gap-3 text-text-primary">
              <span className="text-text-secondary">{p.icon}</span>
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-text-muted">{p.description}</div>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {p.downloads.map((d) => (
                <div key={d.filename} className="flex flex-1 flex-col">
                  {d.note && (
                    <p className="mb-1.5 text-xs text-text-muted leading-relaxed">{d.note}</p>
                  )}

                  {/* Error message (native only) */}
                  {isNativeApp && dlErrors[d.filename] && (
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle size={11} />
                      {dlErrors[d.filename]}
                    </div>
                  )}

                  {/* Native app: button calling Go binding */}
                  {isNativeApp ? (
                    <button
                      onClick={() => handleNativeDownload(`/downloads/${d.filename}`, d.filename)}
                      disabled={!!downloading[d.filename]}
                      className={
                        d.primary
                          ? 'mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
                          : 'mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-tertiary px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-60'
                      }
                    >
                      {downloading[d.filename] ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Downloading…
                        </>
                      ) : downloaded[d.filename] ? (
                        <>
                          <CheckCircle size={13} className={d.primary ? 'text-white/80' : 'text-green-400'} />
                          Saved
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          {d.label}
                        </>
                      )}
                    </button>
                  ) : (
                    /* Browser: standard anchor download */
                    <a
                      href={`/downloads/${d.filename}`}
                      download={d.filename}
                      className={
                        d.primary
                          ? 'mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90'
                          : 'mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-tertiary px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary'
                      }
                    >
                      <Download size={13} />
                      {d.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Build-it-yourself note */}
      <div className="mt-8 rounded-xl border border-border bg-bg-secondary p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ExternalLink size={14} />
          Build from source
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          The desktop app lives in the{' '}
          <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">desktop-app/</code>{' '}
          directory of the Obliview repository.
          It is a Go application using the native OS webview (WebView2 on Windows, WKWebView on macOS).{' '}
          On Windows run{' '}
          <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">.\build-windows.ps1</code>{' '}
          (requires WiX v4: <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">dotnet tool install --global wix</code>).{' '}
          On macOS run{' '}
          <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">./build-mac.sh</code>.
        </p>
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
        <div className="mb-3 text-sm font-semibold text-text-primary">How it works</div>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-primary">1.</span>
            On first launch, enter your Obliview server URL. It is saved locally.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-primary">2.</span>
            The app opens your Obliview in a native window — no browser tabs, no address bar.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-primary">3.</span>
            Sound notifications play when a probe goes down/up or an agent threshold is breached/cleared.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-primary">4.</span>
            Click the ⚙ gear icon (bottom-right corner) to change the server URL at any time.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-primary">5.</span>
            No rebuild is needed after Obliview updates — the app always loads the latest web UI.
          </li>
        </ul>
      </div>
    </div>
  );
}
