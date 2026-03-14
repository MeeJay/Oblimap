/**
 * Site export utilities — CSV and multi-sheet Excel (xlsx).
 * xlsx (SheetJS) is the only dependency; it handles the binary OOXML format.
 */
import * as XLSX from 'xlsx';
import type { SiteItem, IpReservation } from '@oblimap/shared';

// ─── Column definitions ───────────────────────────────────────────────────────

const ITEM_HEADERS = [
  'IP', 'MAC', 'Hostname', 'Display Name', 'Status',
  'Type', 'Vendor', 'Manual', 'First Seen', 'Last Seen', 'Notes',
];

const RESV_HEADERS = [
  'IP', 'Name', 'Description', 'Type', 'Status', 'Occupied By MAC',
];

// ─── Row mappers ──────────────────────────────────────────────────────────────

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

function itemRow(item: SiteItem): string[] {
  return [
    item.ip,
    item.mac ?? '',
    item.hostname ?? '',
    item.customName ?? '',
    item.status,
    item.deviceType,
    item.vendor ?? '',
    item.isManual ? 'Yes' : 'No',
    fmtDate(item.firstSeenAt),
    fmtDate(item.lastSeenAt),
    item.notes ?? '',
  ];
}

function resvRow(r: IpReservation): string[] {
  return [
    r.ip,
    r.name,
    r.description ?? '',
    r.deviceType ?? '',
    r.isOccupied ? 'Occupied' : 'Free',
    r.occupiedByMac ?? '',
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape a value for RFC 4180 CSV. */
function csvEsc(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/** Convert headers + rows to a CSV string (CRLF line endings, UTF-8). */
function toCSV(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((line) => line.map(csvEsc).join(','))
    .join('\r\n');
}

/** Trigger a browser file download. */
function triggerDownload(filename: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Strip filesystem-unsafe characters from a site name for use in filenames. */
function safeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'site';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Download all devices in this site as a UTF-8 CSV file.
 */
export function exportSiteCSV(siteName: string, items: SiteItem[]): void {
  const csv = toCSV(ITEM_HEADERS, items.map(itemRow));
  // Prepend BOM so Excel opens it correctly without re-encoding
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(`${safeName(siteName)}_devices.csv`, blob);
}

/**
 * Download a two-sheet Excel workbook:
 *   Sheet 1 — Devices (all site items)
 *   Sheet 2 — Reservations
 */
export function exportSiteExcel(
  siteName: string,
  items: SiteItem[],
  reservations: IpReservation[],
): void {
  const wb = XLSX.utils.book_new();

  // Devices sheet
  const wsDevices = XLSX.utils.aoa_to_sheet([
    ITEM_HEADERS,
    ...items.map(itemRow),
  ]);
  XLSX.utils.book_append_sheet(wb, wsDevices, 'Devices');

  // Reservations sheet
  const wsResv = XLSX.utils.aoa_to_sheet([
    RESV_HEADERS,
    ...reservations.map(resvRow),
  ]);
  XLSX.utils.book_append_sheet(wb, wsResv, 'Reservations');

  const filename = `${safeName(siteName)}_export.xlsx`;
  XLSX.writeFile(wb, filename);
}
