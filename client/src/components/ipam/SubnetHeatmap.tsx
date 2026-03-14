/**
 * SubnetHeatmap — visual /24-level IP address space grid.
 *
 * Groups site items and IP reservations by /24 subnet and renders a
 * 16 × 16 cell grid (256 host addresses per subnet).
 * Cell colours:
 *   online     → emerald
 *   offline    → red
 *   reserved   → blue
 *   unknown    → zinc
 *   empty      → bg-bg-elevated (muted)
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiteItem, IpReservation, ItemStatus } from '@oblimap/shared';
import { clsx } from 'clsx';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Parse an IPv4 string into an array [a, b, c, d] or null on failure. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

/** Return the /24 key for an IP string, e.g. "192.168.1" */
function slashTwentyFour(ip: string): string | null {
  const p = parseIpv4(ip);
  if (!p) return null;
  return `${p[0]}.${p[1]}.${p[2]}`;
}

/** Return the host octet (0-255) for an IP string */
function hostOctet(ip: string): number | null {
  const p = parseIpv4(ip);
  return p ? p[3] : null;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface CellData {
  ip: string;
  status: ItemStatus;
  label: string;    // display name for tooltip
  isReservation: boolean;
  hasConflict: boolean;
}

interface SubnetSlice {
  prefix: string;               // e.g. "192.168.1"
  cells: (CellData | null)[];   // 256 entries, index = host octet
}

// ── color mapping ─────────────────────────────────────────────────────────────

function cellBg(cell: CellData): string {
  if (cell.hasConflict)   return 'bg-orange-500';
  if (cell.isReservation && cell.status === 'unknown') return 'bg-blue-500/50';
  switch (cell.status) {
    case 'online':   return 'bg-emerald-500';
    case 'offline':  return 'bg-red-500';
    case 'reserved': return 'bg-blue-500';
    default:         return 'bg-zinc-600';
  }
}

function cellRing(cell: CellData): string {
  if (cell.hasConflict) return 'ring-orange-400';
  switch (cell.status) {
    case 'online':   return 'ring-emerald-400';
    case 'offline':  return 'ring-red-400';
    case 'reserved': return 'ring-blue-400';
    default:         return 'ring-zinc-400';
  }
}

// ── Legend item ───────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className={clsx('inline-block h-3 w-3 rounded-sm', color)} />
      {label}
    </span>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  cell: CellData;
  col: number;   // 0-15
  row: number;   // 0-15
  conflictLabel: string;
  reservedLabel: string;
}

function Tooltip({ cell, col, row, conflictLabel, reservedLabel }: TooltipProps) {
  // Position left side for right half of grid, right side otherwise
  const alignRight = col >= 8;
  return (
    <div
      className={clsx(
        'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs shadow-xl',
        'top-1/2 -translate-y-1/2',
        alignRight ? 'right-[calc(100%+6px)]' : 'left-[calc(100%+6px)]',
        row <= 2 ? 'top-0 translate-y-0' : '',
        row >= 13 ? 'bottom-0 top-auto translate-y-0' : '',
      )}
    >
      <div className="font-mono font-semibold text-text-primary">{cell.ip}</div>
      <div className="text-text-secondary mt-0.5">{cell.label}</div>
      <div className={clsx(
        'mt-1 font-medium capitalize',
        cell.status === 'online'   && 'text-emerald-400',
        cell.status === 'offline'  && 'text-red-400',
        cell.status === 'reserved' && 'text-blue-400',
        cell.status === 'unknown'  && 'text-zinc-400',
        cell.hasConflict           && 'text-orange-400',
      )}>
        {cell.hasConflict ? conflictLabel : cell.status}
        {cell.isReservation && !cell.hasConflict && ` ${reservedLabel}`}
      </div>
    </div>
  );
}

// ── Subnet grid ───────────────────────────────────────────────────────────────

function SubnetGrid({
  slice,
  usedLabel,
  conflictLabel,
  reservedLabel,
}: {
  slice: SubnetSlice;
  usedLabel: string;
  conflictLabel: string;
  reservedLabel: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      {/* Subnet header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-text-primary">
          {slice.prefix}<span className="text-text-muted">.0/24</span>
        </span>
        <span className="text-xs text-text-muted">
          {slice.cells.filter(Boolean).length} {usedLabel}
        </span>
      </div>

      {/* Column header 0–F */}
      <div className="flex mb-0.5">
        <div className="w-8" /> {/* row label spacer */}
        {Array.from({ length: 16 }, (_, col) => (
          <div key={col} className="flex-1 text-center text-[9px] font-mono text-text-muted leading-none pb-0.5">
            {col.toString(16).toUpperCase()}
          </div>
        ))}
      </div>

      {/* 16 rows */}
      {Array.from({ length: 16 }, (_, row) => (
        <div key={row} className="flex mb-0.5 items-center">
          {/* Row label */}
          <div className="w-8 text-right pr-1.5 text-[9px] font-mono text-text-muted leading-none shrink-0">
            {(row * 16).toString(16).toUpperCase()}x
          </div>
          {Array.from({ length: 16 }, (_, col) => {
            const idx = row * 16 + col;
            const cell = slice.cells[idx];
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={col}
                className="relative flex-1 px-px"
                onMouseEnter={() => cell && setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div
                  className={clsx(
                    'h-4 w-full rounded-sm transition-transform',
                    cell ? cellBg(cell) : 'bg-bg-elevated',
                    cell && 'cursor-pointer',
                    cell && isHovered && `ring-1 ${cellRing(cell)} scale-125 z-10`,
                  )}
                />
                {cell && isHovered && (
                  <Tooltip
                    cell={cell}
                    col={col}
                    row={row}
                    conflictLabel={conflictLabel}
                    reservedLabel={reservedLabel}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface SubnetHeatmapProps {
  items: SiteItem[];
  reservations: IpReservation[];
}

export function SubnetHeatmap({ items, reservations }: SubnetHeatmapProps) {
  const { t } = useTranslation();

  const slices = useMemo<SubnetSlice[]>(() => {
    const subnets = new Map<string, (CellData | null)[]>();

    const getOrCreate = (prefix: string): (CellData | null)[] => {
      if (!subnets.has(prefix)) subnets.set(prefix, new Array(256).fill(null) as null[]);
      return subnets.get(prefix)!;
    };

    // First pass: reservations (lower priority, items override)
    for (const r of reservations) {
      const prefix = slashTwentyFour(r.ip);
      const host   = hostOctet(r.ip);
      if (prefix === null || host === null) continue;
      const cells = getOrCreate(prefix);
      if (!cells[host]) {
        cells[host] = {
          ip: r.ip,
          status: r.isOccupied ? 'offline' : 'reserved',
          label: r.name || r.ip,
          isReservation: true,
          hasConflict: false,
        };
      }
    }

    // Second pass: discovered/manual items (take priority)
    for (const item of items) {
      const prefix = slashTwentyFour(item.ip);
      const host   = hostOctet(item.ip);
      if (prefix === null || host === null) continue;
      const cells = getOrCreate(prefix);
      const existing = cells[host];
      const hasConflict = item.hasReservationConflict ?? false;
      cells[host] = {
        ip: item.ip,
        status: item.status,
        label: item.customName || item.hostname || item.mac || item.ip,
        isReservation: false,
        hasConflict,
      };
      // Mark conflict if there's a reservation on the same IP
      if (existing?.isReservation && existing.ip === item.ip) {
        cells[host]!.hasConflict = hasConflict || existing.ip !== item.ip;
      }
    }

    // Sort subnets numerically
    const sorted = [...subnets.entries()].sort(([a], [b]) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
      }
      return 0;
    });

    return sorted.map(([prefix, cells]) => ({ prefix, cells }));
  }, [items, reservations]);

  if (slices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-16 text-center">
        <p className="text-text-muted text-sm">{t('heatmap.noData')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <LegendDot color="bg-emerald-500" label={t('heatmap.legendOnline')} />
        <LegendDot color="bg-red-500"     label={t('heatmap.legendOffline')} />
        <LegendDot color="bg-blue-500"    label={t('heatmap.legendReserved')} />
        <LegendDot color="bg-zinc-600"    label={t('heatmap.legendUnknown')} />
        <LegendDot color="bg-orange-500"  label={t('heatmap.legendConflict')} />
        <LegendDot color="bg-bg-elevated border border-border" label={t('heatmap.legendEmpty')} />
        <span className="ml-auto text-xs text-text-muted">{t('heatmap.hoverHint')}</span>
      </div>

      {/* One card per /24 subnet */}
      <div className="flex flex-col gap-4">
        {slices.map((slice) => (
          <SubnetGrid
            key={slice.prefix}
            slice={slice}
            usedLabel={t('heatmap.used')}
            conflictLabel={t('heatmap.tooltipConflict')}
            reservedLabel={t('heatmap.tooltipReserved')}
          />
        ))}
      </div>
    </div>
  );
}
