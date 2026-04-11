import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { tunnelService } from '../services/tunnel.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// All tunnel routes require auth + tenant + admin
router.use(requireAuth);
router.use(requireTenant);
router.use(requireRole('admin'));

// POST /api/tunnel — open a new tunnel
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { siteId, targetIp, targetPort, probeId } = req.body as {
      siteId: number;
      targetIp: string;
      targetPort: number;
      probeId?: number | null;
    };

    if (!siteId || !targetIp || !targetPort) {
      throw new AppError(400, 'siteId, targetIp, and targetPort are required');
    }

    const tunnel = await tunnelService.openTunnel(
      req.tenantId,
      req.session.userId!,
      siteId,
      targetIp,
      targetPort,
      probeId,
    );

    res.json({ tunnel });
  } catch (err) {
    next(err);
  }
});

// GET /api/tunnel — list active tunnels
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tunnels = await tunnelService.listTunnels(req.tenantId);
    res.json({ tunnels });
  } catch (err) {
    next(err);
  }
});

// GET /api/tunnel/:id — get tunnel status
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tunnel = await tunnelService.getTunnel(req.params.id, req.tenantId);
    if (!tunnel) throw new AppError(404, 'Tunnel not found');
    res.json({ tunnel });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tunnel/:id — close a tunnel
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tunnelService.closeTunnel(req.params.id, req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
