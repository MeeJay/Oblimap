import type { Request, Response, NextFunction } from 'express';
import { probeService } from '../services/probe.service';
import { AppError } from '../middleware/errorHandler';

export const probeController = {
  // ── Probe Push (API-key auth, no session required) ────────────────────────

  async push(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      const probeUuid = req.headers['x-probe-uuid'] as string | undefined;

      if (!apiKey || !probeUuid) {
        res
          .status(400)
          .json({ error: 'Missing X-API-Key or X-Probe-UUID header' });
        return;
      }

      const result = await probeService.handlePush(apiKey, probeUuid, req.body);
      const { httpStatus, ...body } = result;
      res.status(httpStatus).json(body);
    } catch (err) {
      next(err);
    }
  },

  // ── API Keys ──────────────────────────────────────────────────────────────

  async listKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keys = await probeService.getApiKeys(req.tenantId);
      res.json({ keys });
    } catch (err) {
      next(err);
    }
  },

  async createKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body as { name: string };
      if (!name?.trim()) {
        throw new AppError(400, 'Name is required');
      }
      const key = await probeService.createApiKey(
        req.tenantId,
        name.trim(),
        req.session.userId!,
      );
      res.status(201).json({ key });
    } catch (err) {
      next(err);
    }
  },

  async deleteKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.deleteApiKey(req.tenantId, parseInt(req.params.id, 10));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Probe CRUD ────────────────────────────────────────────────────────────

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probes = await probeService.getProbes(req.tenantId);
      res.json({ probes });
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probe = await probeService.getProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as {
        name?: string;
        siteId?: number | null;
        scanIntervalSeconds?: number;
        scanConfig?: { excludedSubnets: string[]; extraSubnets: string[] };
      };
      const probe = await probeService.updateProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
        body,
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const probe = await probeService.approveProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
        req.session.userId!,
      );
      if (!probe) throw new AppError(404, 'Probe not found');
      res.json({ probe });
    } catch (err) {
      next(err);
    }
  },

  async refuse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.refuseProbe(
        req.tenantId,
        parseInt(req.params.id, 10),
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async sendCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { command } = req.body as { command: string };
      if (!command) throw new AppError(400, 'Command is required');
      const allowed = ['uninstall', 'update', 'rescan'];
      if (!allowed.includes(command)) {
        throw new AppError(400, `Unknown command: ${command}`);
      }
      await probeService.sendCommand(
        req.tenantId,
        parseInt(req.params.id, 10),
        command,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await probeService.deleteProbe(req.tenantId, parseInt(req.params.id, 10));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Bulk ──────────────────────────────────────────────────────────────────

  async bulk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, ids } = req.body as { action: string; ids: number[] };
      if (!action || !Array.isArray(ids) || ids.length === 0) {
        throw new AppError(400, 'action and ids[] are required');
      }
      switch (action) {
        case 'approve':
          await probeService.bulkApprove(req.tenantId, ids, req.session.userId!);
          break;
        case 'delete':
          await probeService.bulkDelete(req.tenantId, ids);
          break;
        case 'uninstall':
          await probeService.bulkCommand(req.tenantId, ids, 'uninstall');
          break;
        default:
          throw new AppError(400, `Unknown bulk action: ${action}`);
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
