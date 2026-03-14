import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import type { MacVendor } from '@oblimap/shared';

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
