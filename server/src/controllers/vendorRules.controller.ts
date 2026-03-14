import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import type { VendorTypeRule, DeviceType } from '@oblimap/shared';

// ── helpers ──────────────────────────────────────────────────────────────────

function toRule(row: Record<string, unknown>): VendorTypeRule {
  return {
    id:            row.id as number,
    groupId:       row.group_id as number | null,
    tenantId:      row.tenant_id as number,
    vendorPattern: row.vendor_pattern as string,
    deviceType:    row.device_type as DeviceType,
    label:         row.label as string | null,
    priority:      row.priority as number,
    createdAt:     (row.created_at as Date).toISOString(),
  };
}

// ── controller ────────────────────────────────────────────────────────────────

export const vendorRulesController = {

  /** GET /vendor-rules?groupId=N  — list rules for tenant, optionally filtered by group */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;
      const q = db('vendor_type_rules').where('tenant_id', req.tenantId);
      if (groupId !== undefined) {
        q.andWhere('group_id', groupId);
      }
      const rows = await q.orderBy('priority', 'desc').orderBy('id', 'asc');
      res.json({ rules: rows.map(toRule) });
    } catch (err) { next(err); }
  },

  /** POST /vendor-rules */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { vendorPattern, deviceType, label, priority, groupId } = req.body as {
        vendorPattern: string;
        deviceType: DeviceType;
        label?: string | null;
        priority?: number;
        groupId?: number | null;
      };
      if (!vendorPattern?.trim()) throw new AppError(400, 'vendorPattern is required');
      if (!deviceType) throw new AppError(400, 'deviceType is required');

      const [row] = await db('vendor_type_rules').insert({
        tenant_id:      req.tenantId,
        group_id:       groupId ?? null,
        vendor_pattern: vendorPattern.trim(),
        device_type:    deviceType,
        label:          label?.trim() || null,
        priority:       priority ?? 0,
      }).returning('*');
      res.status(201).json({ rule: toRule(row) });
    } catch (err) { next(err); }
  },

  /** PATCH /vendor-rules/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ruleId = parseInt(req.params.id, 10);
      const existing = await db('vendor_type_rules')
        .where({ id: ruleId, tenant_id: req.tenantId }).first();
      if (!existing) throw new AppError(404, 'Rule not found');

      const { vendorPattern, deviceType, label, priority } = req.body as {
        vendorPattern?: string;
        deviceType?: DeviceType;
        label?: string | null;
        priority?: number;
      };

      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (vendorPattern !== undefined) patch.vendor_pattern = vendorPattern.trim();
      if (deviceType   !== undefined) patch.device_type    = deviceType;
      if (label        !== undefined) patch.label          = label?.trim() || null;
      if (priority     !== undefined) patch.priority       = priority;

      const [row] = await db('vendor_type_rules')
        .where({ id: ruleId, tenant_id: req.tenantId })
        .update(patch)
        .returning('*');
      res.json({ rule: toRule(row) });
    } catch (err) { next(err); }
  },

  /** DELETE /vendor-rules/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ruleId = parseInt(req.params.id, 10);
      const deleted = await db('vendor_type_rules')
        .where({ id: ruleId, tenant_id: req.tenantId })
        .delete();
      if (!deleted) throw new AppError(404, 'Rule not found');
      res.status(204).send();
    } catch (err) { next(err); }
  },
};
