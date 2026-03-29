import { useState, useEffect } from 'react';
import { Key, Copy, Check, ChevronDown, ChevronRight, Radar } from 'lucide-react';
import type { ProbeApiKey } from '@oblimap/shared';
import { probeApi } from '@/api/probe.api';
import { Button } from '@/components/common/Button';
import { useUiStore } from '@/store/uiStore';

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

/** Quick-install modal for the Oblimap probe binary. */
export function GlobalAddProbeModal() {
  const { addProbeModalOpen, closeAddProbeModal } = useUiStore();
  const [keys, setKeys] = useState<ProbeApiKey[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!addProbeModalOpen) return;
    probeApi.listKeys().then(({ keys: k }) => {
      setKeys(k);
      setExpandedKeys(new Set(k.map((key) => key.id)));
    }).catch(() => {});
  }, [addProbeModalOpen]);

  if (!addProbeModalOpen) return null;

  const toggleKey = (id: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const origin = window.location.origin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-bg-primary shadow-2xl overflow-y-auto max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Radar size={18} className="text-accent" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">Add Probe</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Install the Oblimap probe binary and point it at this server
              </p>
            </div>
          </div>
          <button onClick={closeAddProbeModal} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {keys.length === 0 ? (
            <div className="text-center py-8">
              <Key size={28} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-muted">Create a Probe API Key first in the Probes admin page</p>
            </div>
          ) : (
            keys.map((apiKey) => {
              const expanded = expandedKeys.has(apiKey.id);

              // Install commands — matching Obliview's agent pattern exactly
              const linuxCmd    = `${origin}/api/probe/installer/linux?key=${apiKey.key}`;
              const macosCmd    = `${origin}/api/probe/installer/macos?key=${apiKey.key}`;
              const freebsdCmd  = `${origin}/api/probe/installer/freebsd?key=${apiKey.key}`;
              const msiUrl      = `${origin}/api/probe/installer/windows.msi`;
              const windowsCmd = `$m="$env:TEMP\\oblimap-probe.msi"; Invoke-WebRequest "${msiUrl}" -OutFile $m -UseBasicParsing; Start-Process msiexec -ArgumentList "/i \`"$m\`" SERVERURL=\`"${origin}\`" APIKEY=\`"${apiKey.key}\`" /quiet" -Wait -Verb RunAs; Remove-Item $m`;

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
                      <span className="ml-2 text-xs font-mono text-text-muted">
                        {apiKey.key.slice(0, 8)}...{apiKey.key.slice(-4)}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border">
                      {[
                        { label: 'Linux (amd64 / arm64)', cmd: `curl -fsSL "${linuxCmd}" | bash` },
                        { label: 'FreeBSD / OPNsense (amd64)', cmd: `fetch -o - "${freebsdCmd}" | sh` },
                        { label: 'macOS (Apple Silicon / Intel)', cmd: `sudo bash -c "$(curl -fsSL '${macosCmd}')"` },
                        { label: 'Windows — PowerShell (admin)', cmd: windowsCmd },
                      ].map(({ label, cmd }) => (
                        <div key={label}>
                          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 mt-3">
                            {label}
                          </p>
                          <div className="flex items-start gap-2 rounded-md bg-bg-tertiary p-3">
                            <code className="flex-1 text-xs font-mono text-text-primary break-all leading-relaxed">
                              {cmd}
                            </code>
                            <CopyButton text={cmd} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 pb-6">
          <Button variant="secondary" onClick={closeAddProbeModal} className="w-full">Close</Button>
        </div>
      </div>
    </div>
  );
}
