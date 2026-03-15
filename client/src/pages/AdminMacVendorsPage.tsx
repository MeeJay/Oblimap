/**
 * AdminMacVendorsPage — view and manage the IEEE OUI vendor database.
 *
 * - Browse all ~30 000 OUI prefixes with search
 * - Set a custom display-name override per prefix
 * - Clear overrides to revert to the IEEE default name
 * - "Overrides only" filter to see what has been customized
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Edit2, Check, X, Trash2, Database, Tag, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MacVendor } from '@oblimap/shared';
import { macVendorsApi } from '@/api/macVendors.api';
import { Button } from '@/components/common/Button';
import { cn } from '@/utils/cn';

// ── Inline edit cell ──────────────────────────────────────────────────────────

function EditCell({
  vendor,
  onSaved,
}: {
  vendor: MacVendor;
  onSaved: (updated: MacVendor) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(vendor.customName ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setValue(vendor.customName ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancel = () => {
    setEditing(false);
    setValue(vendor.customName ?? '');
  };

  const save = async () => {
    setSaving(true);
    try {
      const trimmed = value.trim() || null;
      const { vendor: updated } = await macVendorsApi.updateCustomName(vendor.prefix, trimmed);
      onSaved(updated);
      setEditing(false);
      toast.success(trimmed ? 'Override saved' : 'Override cleared');
    } catch {
      toast.error('Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    setSaving(true);
    try {
      await macVendorsApi.clearOverride(vendor.prefix);
      const cleared: MacVendor = { ...vendor, customName: null, effectiveName: vendor.vendorName };
      onSaved(cleared);
      setEditing(false);
      toast.success('Override cleared');
    } catch {
      toast.error('Failed to clear override');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          className="flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') cancel();
          }}
          placeholder="Custom name…"
        />
        <button
          onClick={() => { void save(); }}
          disabled={saving}
          className="flex h-6 w-6 items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
          title="Save"
        ><Check size={12} /></button>
        <button
          onClick={cancel}
          className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover"
          title="Cancel"
        ><X size={12} /></button>
        {vendor.customName && (
          <button
            onClick={() => void clearOverride()}
            disabled={saving}
            className="flex h-6 w-6 items-center justify-center rounded text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            title="Clear override"
          ><Trash2 size={11} /></button>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1.5">
      {vendor.customName ? (
        <>
          <span className="text-xs text-text-primary">{vendor.customName}</span>
          <span className="text-[10px] text-text-muted line-through">{vendor.vendorName}</span>
        </>
      ) : (
        <span className="text-xs text-text-muted italic">—</span>
      )}
      <button
        onClick={startEdit}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-0 transition-opacity hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
        title="Edit override"
      ><Edit2 size={11} /></button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminMacVendorsPage() {
  const [vendors, setVendors]           = useState<MacVendor[]>([]);
  const [total, setTotal]               = useState(0);
  const [pages, setPages]               = useState(1);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [overrideOnly, setOverrideOnly] = useState(false);
  const [stats, setStats]               = useState<{ total: number; overrides: number; lastUpdated: string | null } | null>(null);
  const [seeding, setSeeding]           = useState(false);

  // Debounce search
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await macVendorsApi.list({
        q: debouncedSearch || undefined,
        page,
        limit: 50,
        overrideOnly: overrideOnly || undefined,
      });
      setVendors(res.vendors);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      toast.error('Failed to load vendor database');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, overrideOnly]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    macVendorsApi.stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleVendorUpdated = (updated: MacVendor) => {
    setVendors((prev) => prev.map((v) => v.prefix === updated.prefix ? updated : v));
    // Refresh stats if override status changed
    macVendorsApi.stats().then(setStats).catch(() => {});
  };

  const handleSeed = async () => {
    setSeeding(true);
    const toastId = toast.loading('Downloading IEEE OUI database…');
    try {
      const { inserted } = await macVendorsApi.seed();
      toast.success(`Seeded ${inserted.toLocaleString()} entries from IEEE`, { id: toastId });
      // Refresh stats and list
      macVendorsApi.stats().then(setStats).catch(() => {});
      void load();
    } catch {
      toast.error('Failed to seed vendor database', { id: toastId });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Database size={22} className="text-accent" />
            MAC Vendor Database
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Browse the IEEE OUI database and override vendor names for specific MAC prefixes.
            Custom names are used when identifying devices on sites.
          </p>
        </div>
        <button
          onClick={() => { void handleSeed(); }}
          disabled={seeding}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title="Download the latest IEEE OUI CSV and upsert all entries. Custom overrides are preserved."
        >
          <RefreshCw size={14} className={seeding ? 'animate-spin' : ''} />
          {seeding ? 'Seeding…' : 'Refresh from IEEE'}
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="rounded-lg border border-border bg-bg-card px-4 py-2">
            <div className="text-xs text-text-muted">Total prefixes</div>
            <div className="text-lg font-semibold text-text-primary">{stats.total.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border bg-bg-card px-4 py-2">
            <div className="text-xs text-text-muted">Custom overrides</div>
            <div className="text-lg font-semibold text-accent">{stats.overrides.toLocaleString()}</div>
          </div>
          {stats.lastUpdated && (
            <div className="rounded-lg border border-border bg-bg-card px-4 py-2">
              <div className="text-xs text-text-muted">Last seeded</div>
              <div className="text-sm font-medium text-text-primary">
                {new Date(stats.lastUpdated).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search prefix or vendor name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-bg-tertiary py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={overrideOnly}
            onChange={(e) => { setOverrideOnly(e.target.checked); setPage(1); }}
            className="rounded border-border accent-accent"
          />
          <Tag size={13} className="text-accent" />
          Overrides only
        </label>
        <span className="text-xs text-text-muted ml-auto">
          {total.toLocaleString()} entries
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                <th className="px-4 py-2.5 w-28">Prefix (OUI)</th>
                <th className="px-4 py-2.5">IEEE Vendor Name</th>
                <th className="px-4 py-2.5 w-72">Custom Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-muted text-xs">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && vendors.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-muted text-xs">
                    {overrideOnly ? 'No custom overrides set.' : 'No entries found.'}
                  </td>
                </tr>
              )}
              {!loading && vendors.map((v) => (
                <tr
                  key={v.prefix}
                  className={cn(
                    'group hover:bg-bg-elevated/50 transition-colors',
                    v.customName && 'bg-accent/5',
                  )}
                >
                  <td className="px-4 py-2">
                    <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs font-mono text-text-primary">
                      {v.prefix}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-text-secondary text-xs">{v.vendorName}</td>
                  <td className="px-4 py-2">
                    <EditCell vendor={v} onSaved={handleVendorUpdated} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="text-xs text-text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </Button>
              {/* Show up to 5 page buttons around current */}
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, pages - 4));
                const n = start + i;
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-xs transition-colors',
                      n === page
                        ? 'bg-accent text-white font-semibold'
                        : 'text-text-muted hover:bg-bg-hover hover:text-text-primary',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="mt-4 rounded-lg border border-border bg-bg-card p-4 text-xs text-text-muted">
        <strong className="text-text-secondary">How overrides work:</strong>{' '}
        When a probe discovers a device, the first 3 octets of the MAC address are looked up here.
        If you set a custom override, that name is shown in the site device list and used in vendor-based
        type classification rules.{' '}
        <strong className="text-text-secondary">Refresh from IEEE</strong>{' '}
        downloads the latest OUI CSV (~30 000 entries) and upserts everything — your custom overrides are always preserved.
      </div>
    </div>
  );
}
