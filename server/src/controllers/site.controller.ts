import type { Request, Response, NextFunction } from 'express';
import { siteService } from '../services/site.service';
import { flowService } from '../services/flow.service';
import { AppError } from '../middleware/errorHandler';
import type { DeviceType, FlowPeriod } from '@oblimap/shared';

export const siteController = {
  // ── Sites ─────────────────────────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groupId = req.query.groupId !== undefined ? parseInt(req.query.groupId as string, 10) : undefined;
      const ungrouped = req.query.ungrouped === 'true';
      const sites = await siteService.getSites(req.tenantId, { groupId, ungrouped });
      res.json({ sites });
    } catch (err) { next(err); }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.getSite(req.tenantId, parseInt(req.params.id, 10));
      if (!site) throw new AppError(404, 'Site not found');
      res.json({ site });
    } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, groupId } = req.body as {
        name: string;
        description?: string | null;
        groupId?: number | null;
      };
      if (!name?.trim()) throw new AppError(400, 'Name is required');
      const site = await siteService.createSite(req.tenantId, { name: name.trim(), description, groupId });
      res.status(201).json({ site });
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await siteService.updateSite(
        req.tenantId,
        parseInt(req.params.id, 10),
        req.body as Parameters<typeof siteService.updateSite>[2],
      );
      if (!site) throw new AppError(404, 'Site not found');
      res.json({ site });
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await siteService.deleteSite(req.tenantId, parseInt(req.params.id, 10));
      res.status(204).send();
    } catch (err) { next(err); }
  },

  // ── Flows ──────────────────────────────────────────────────────────────────

  async listFlows(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = parseInt(req.params.id, 10);
      const period = (req.query.period as string) || '24h';
      if (!['1h', '24h', '30d', '1y'].includes(period)) {
        throw new AppError(400, 'Invalid period. Use: 1h, 24h, 30d, 1y');
      }
      const flows = await flowService.getFlows(req.tenantId, siteId, period as FlowPeriod);
      res.json({ flows });
    } catch (err) { next(err); }
  },

  // ── Items ──────────────────────────────────────────────────────────────────

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await siteService.getItems(req.tenantId, parseInt(req.params.id, 10));
      res.json({ items });
    } catch (err) { next(err); }
  },

  async createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = parseInt(req.params.id, 10);
      const { ip, mac, customName, deviceType, notes } = req.body as {
        ip: string;
        mac?: string | null;
        customName?: string | null;
        deviceType?: DeviceType;
        notes?: string | null;
      };
      if (!ip?.trim()) throw new AppError(400, 'IP address is required');
      const item = await siteService.createManualItem(req.tenantId, siteId, {
        ip: ip.trim(), mac, customName, deviceType, notes,
      });
      res.status(201).json({ item });
    } catch (err) { next(err); }
  },

  async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = await siteService.updateItem(
        req.tenantId,
        parseInt(req.params.id, 10),
        parseInt(req.params.itemId, 10),
        req.body as Parameters<typeof siteService.updateItem>[3],
      );
      if (!item) throw new AppError(404, 'Item not found');
      res.json({ item });
    } catch (err) { next(err); }
  },

  async removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await siteService.deleteItem(
        req.tenantId,
        parseInt(req.params.id, 10),
        parseInt(req.params.itemId, 10),
      );
      res.status(204).send();
    } catch (err) { next(err); }
  },

  async removeSubnet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prefix = req.query.prefix as string;
      if (!prefix || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(prefix)) {
        throw new AppError(400, 'prefix query param required (e.g. 192.168.1)');
      }
      const count = await siteService.deleteItemsBySubnet(
        req.tenantId,
        parseInt(req.params.id, 10),
        prefix,
      );
      res.json({ deleted: count });
    } catch (err) { next(err); }
  },

  // ── Reservations ──────────────────────────────────────────────────────────

  async listReservations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reservations = await siteService.getReservations(req.tenantId, parseInt(req.params.id, 10));
      res.json({ reservations });
    } catch (err) { next(err); }
  },

  async createReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = parseInt(req.params.id, 10);
      const { ip, name, description, deviceType } = req.body as {
        ip: string;
        name: string;
        description?: string | null;
        deviceType?: DeviceType | null;
      };
      if (!ip?.trim()) throw new AppError(400, 'IP address is required');
      if (!name?.trim()) throw new AppError(400, 'Name is required');
      const reservation = await siteService.createReservation(req.tenantId, siteId, {
        ip: ip.trim(),
        name: name.trim(),
        description,
        deviceType,
        createdBy: req.session.userId!,
      });
      res.status(201).json({ reservation });
    } catch (err) { next(err); }
  },

  async updateReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reservation = await siteService.updateReservation(
        req.tenantId,
        parseInt(req.params.id, 10),
        parseInt(req.params.resId, 10),
        req.body as Parameters<typeof siteService.updateReservation>[3],
      );
      if (!reservation) throw new AppError(404, 'Reservation not found');
      res.json({ reservation });
    } catch (err) { next(err); }
  },

  async removeReservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await siteService.deleteReservation(
        req.tenantId,
        parseInt(req.params.id, 10),
        parseInt(req.params.resId, 10),
      );
      res.status(204).send();
    } catch (err) { next(err); }
  },
};
