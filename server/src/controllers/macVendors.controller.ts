import type { Request, Response, NextFunction } from 'express';
import https from 'https';
import http from 'http';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import type { MacVendor } from '@oblimap/shared';

// ── IEEE seed helpers ─────────────────────────────────────────────────────────

const OUI_CSV_URL = 'https://standards-oui.ieee.org/oui/oui.csv';
const BATCH_SIZE  = 500;

function normalizePrefix(raw: string): string {
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 6) return '';
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode ?? '?'}`)); return; }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseOuiCsv(text: string): Array<{ prefix: string; vendor_name: string; updated_at: Date }> {
  const rows: Array<{ prefix: string; vendor_name: string; updated_at: Date }> = [];
  const now = new Date();
  let i = 0; const len = text.length; let firstLine = true;
  while (i < len) {
    const fields: string[] = [];
    while (i < len && text[i] !== '\r' && text[i] !== '\n') {
      if (text[i] === '"') {
        i++; let val = '';
        while (i < len) {
          if (text[i] === '"' && text[i + 1] === '"') { val += '"'; i += 2; }
          else if (text[i] === '"') { i++; break; }
          else { val += text[i++]; }
        }
        fields.push(val);
        if (i < len && text[i] === ',') i++;
      } else {
        const start = i;
        while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++;
        fields.push(text.slice(start, i));
        if (i < len && text[i] === ',') i++;
      }
    }
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (firstLine) { firstLine = false; continue; }
    if (fields.length < 3) continue;
    const prefix = normalizePrefix(fields[1].trim());
    const orgName = fields[2].trim().slice(0, 255);
    if (prefix && orgName) rows.push({ prefix, vendor_name: orgName, updated_at: now });
  }
  return rows;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toMacVendor(row: Record<string, unknown>): MacVendor {
  const vendorName  = row.vendor_name as string;
  const customName  = (row.custom_name as string | null) ?? null;
  return {
    prefix:        row.prefix as string,
    vendorName,
    customName,
    effectiveName: customName ?? vendorName,
    updatedAt:     (row.updated_at as Date).toISOString(),
  };
}

// ── controller ────────────────────────────────────────────────────────────────

export const macVendorsController = {

  /**
   * GET /mac-vendors
   * Query params:
   *   q       — search term (prefix or vendor name)
   *   page    — 1-based page number (default: 1)
   *   limit   — items per page (default: 50, max: 200)
   *   overrideOnly — if "true", only return rows with a custom_name set
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q            = (req.query.q as string | undefined)?.trim() ?? '';
      const page         = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit        = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const overrideOnly = req.query.overrideOnly === 'true';
      const offset       = (page - 1) * limit;

      let query = db('mac_vendors');

      if (overrideOnly) {
        query = query.whereNotNull('custom_name');
      }

      if (q) {
        query = query.where(function () {
          this.where('prefix', 'ilike', `%${q}%`)
            .orWhere('vendor_name', 'ilike', `%${q}%`)
            .orWhere('custom_name', 'ilike', `%${q}%`);
        });
      }

      const [countRow] = await query.clone().count<[{ count: string }]>('prefix as count');
      const total = parseInt(countRow.count, 10);

      const rows = await query
        .orderByRaw("COALESCE(custom_name, vendor_name) ASC")
        .limit(limit)
        .offset(offset)
        .select('prefix', 'vendor_name', 'custom_name', 'updated_at');

      res.json({
        vendors: rows.map(toMacVendor),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (err) { next(err); }
  },

  /**
   * PATCH /mac-vendors/:prefix
   * Body: { customName: string | null }
   * Sets or clears the custom name override for a specific OUI prefix.
   * Returns 404 if the prefix doesn't exist in the IEEE table.
   */
  async updateCustomName(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefix = req.params.prefix.toUpperCase();
      const existing = await db('mac_vendors').where({ prefix }).first();
      if (!existing) throw new AppError(404, 'OUI prefix not found');

      const { customName } = req.body as { customName?: string | null };
      const normalized = typeof customName === 'string' && customName.trim()
        ? customName.trim()
        : null;

      const [row] = await db('mac_vendors')
        .where({ prefix })
        .update({
          custom_name: normalized,
          updated_at: new Date(),
        })
        .returning('*');

      res.json({ vendor: toMacVendor(row) });
    } catch (err) { next(err); }
  },

  /**
   * DELETE /mac-vendors/:prefix/override
   * Clears the custom name override (resets to IEEE default).
   */
  async clearOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefix = req.params.prefix.toUpperCase();
      const updated = await db('mac_vendors')
        .where({ prefix })
        .update({ custom_name: null, updated_at: new Date() });
      if (!updated) throw new AppError(404, 'OUI prefix not found');
      res.status(204).send();
    } catch (err) { next(err); }
  },

  /**
   * POST /mac-vendors/seed
   * Downloads the current IEEE OUI CSV and upserts all entries.
   * Custom name overrides are preserved.  Returns { inserted } count.
   */
  async seed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const text = await fetchText(OUI_CSV_URL);
      const rows = parseOuiCsv(text);
      let inserted = 0;
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);
        await db('mac_vendors')
          .insert(batch)
          .onConflict('prefix')
          .merge(['vendor_name', 'updated_at']);
        inserted += batch.length;
      }
      res.json({ inserted });
    } catch (err) { next(err); }
  },

  /**
   * GET /mac-vendors/stats
   * Returns aggregate stats: total entries, entries with overrides, last updated.
   */
  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [totals] = await db('mac_vendors')
        .count<[{ total: string; overrides: string }]>({
          total: '*',
          overrides: db.raw('count(*) filter (where custom_name is not null)'),
        });
      const lastRow = await db('mac_vendors')
        .orderBy('updated_at', 'desc')
        .first('updated_at');

      res.json({
        total:     parseInt(totals.total, 10),
        overrides: parseInt(totals.overrides, 10),
        lastUpdated: lastRow ? (lastRow.updated_at as Date).toISOString() : null,
      });
    } catch (err) { next(err); }
  },
};
