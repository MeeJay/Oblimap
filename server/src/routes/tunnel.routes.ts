import http from 'http';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { tunnelService, getTunnelLocalPort } from '../services/tunnel.service';
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

// ALL /api/tunnel/:id/proxy/* — HTTP reverse proxy through the tunnel
// This is the core feature: browser requests are forwarded through the probe to the target device.
router.all('/:id/proxy', proxyHandler);
router.all('/:id/proxy/*', proxyHandler);

function proxyHandler(req: Request, res: Response, next: NextFunction): void {
  const tunnelId = req.params.id;
  const localPort = getTunnelLocalPort(tunnelId);

  if (!localPort) {
    next(new AppError(404, 'Tunnel not active or no local relay'));
    return;
  }

  // Build the path to forward (strip /api/tunnel/:id/proxy prefix)
  const proxyPath = req.params[0] ? `/${req.params[0]}` : '/';
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

  const fwdHeaders: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === 'string' && key !== 'cookie' && key !== 'authorization') {
      fwdHeaders[key] = val;
    }
  }
  fwdHeaders['host'] = (req.headers['x-tunnel-host'] as string) || (req.headers.host as string) || 'localhost';
  fwdHeaders['connection'] = 'close';

  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: localPort,
    path: proxyPath + qs,
    method: req.method,
    headers: fwdHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Copy status and headers
    const headers = { ...proxyRes.headers };
    // Remove security headers that would break iframe/new-tab display
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];

    res.writeHead(proxyRes.statusCode ?? 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
  });

  // Pipe request body for POST/PUT/PATCH
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

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
