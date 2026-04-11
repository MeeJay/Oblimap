import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { tunnelService } from '../services/tunnel.service';
import { getTunnelDataWs } from '../services/probeHub.service';
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

// ALL /api/tunnel/:id/proxy/* — HTTP reverse proxy through the tunnel.
// Bridges browser HTTP requests directly to the tunnel WS → probe → target device.
router.all('/:id/proxy', proxyHandler);
router.all('/:id/proxy/*', proxyHandler);

async function proxyHandler(req: Request, res: Response, _next: NextFunction): Promise<void> {
  const tunnelId = req.params.id;

  // Wait for the probe's tunnel data WS to be available (up to 8 seconds)
  let tunnelWs = getTunnelDataWs(tunnelId);
  if (!tunnelWs || tunnelWs.readyState !== 1) {
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      tunnelWs = getTunnelDataWs(tunnelId);
      if (tunnelWs && tunnelWs.readyState === 1) break;
    }
  }

  if (!tunnelWs || tunnelWs.readyState !== 1) {
    res.status(502).json({ error: 'Tunnel data channel not connected (probe may still be connecting)' });
    return;
  }

  // Build the raw HTTP request to send through the tunnel.
  // The tunnel is a raw TCP pipe to the target, so we write HTTP/1.1 bytes.
  const proxyPath = req.params[0] ? `/${req.params[0]}` : '/';
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const targetPath = proxyPath + qs;

  // Look up the tunnel to get the target host for the Host header
  const tunnel = await tunnelService.getTunnel(tunnelId, req.tenantId);
  const targetHost = tunnel ? `${tunnel.targetIp}:${tunnel.targetPort}` : 'localhost';

  // Serialize HTTP request line + headers
  let httpReq = `${req.method} ${targetPath} HTTP/1.1\r\n`;
  httpReq += `Host: ${targetHost}\r\n`;
  httpReq += `Connection: close\r\n`;

  // Forward select headers
  const skip = new Set(['host', 'connection', 'cookie', 'authorization', 'upgrade', 'sec-websocket-key']);
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === 'string' && !skip.has(key)) {
      httpReq += `${key}: ${val}\r\n`;
    }
  }
  httpReq += '\r\n';

  // Collect request body if present
  const bodyChunks: Buffer[] = [];
  for await (const chunk of req) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;

  const reqBuf = body
    ? Buffer.concat([Buffer.from(httpReq), body])
    : Buffer.from(httpReq);

  // Send the raw HTTP request through the tunnel WS
  try {
    tunnelWs.send(reqBuf);
  } catch (err) {
    res.status(502).json({ error: 'Failed to send through tunnel' });
    return;
  }

  // Read the response from the tunnel WS.
  // The target will send back raw HTTP response bytes.
  // We collect them and pipe to the browser response.
  let responded = false;
  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      tunnelWs!.removeAllListeners('message');
      if (!res.headersSent) {
        res.status(504).json({ error: 'Tunnel proxy timeout — target did not respond' });
      }
    }
  }, 30_000);

  // Buffer response data and pipe directly to the browser.
  // The tunnel sends back raw HTTP (status line + headers + body).
  // We pass it through as-is, stripping only security headers that block display.
  let headersParsed = false;
  let headerBuf = Buffer.alloc(0);

  const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (responded) return;
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (!headersParsed) {
      // Accumulate until we find the \r\n\r\n header/body separator
      headerBuf = Buffer.concat([headerBuf, chunk]);
      const sepIdx = headerBuf.indexOf('\r\n\r\n');
      if (sepIdx === -1) return; // Need more data

      headersParsed = true;
      const headerStr = headerBuf.subarray(0, sepIdx).toString();
      const bodyStart = headerBuf.subarray(sepIdx + 4);

      // Parse status line and headers
      const lines = headerStr.split('\r\n');
      const statusMatch = lines[0]?.match(/^HTTP\/\d\.\d\s+(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;

      const headers: Record<string, string> = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIdx = lines[i].indexOf(':');
        if (colonIdx > 0) {
          const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
          const val = lines[i].substring(colonIdx + 1).trim();
          // Skip headers that would block display in iframe/new-tab
          if (key === 'x-frame-options' || key === 'content-security-policy') continue;
          // Skip transfer-encoding since we're buffering
          if (key === 'transfer-encoding') continue;
          headers[key] = val;
        }
      }

      res.writeHead(statusCode, headers);
      if (bodyStart.length > 0) res.write(bodyStart);
    } else {
      res.write(chunk);
    }
  };

  const onClose = () => {
    clearTimeout(timeout);
    tunnelWs!.off('message', onMessage);
    tunnelWs!.off('close', onClose);
    if (!responded) {
      responded = true;
      res.end();
    }
  };

  tunnelWs.on('message', onMessage);
  tunnelWs.on('close', onClose);

  // The target sends Connection: close, so the probe will close the TCP socket
  // after the full response, which closes the tunnel WS, which triggers onClose above.
  // But we also need a fallback for keep-alive responses.
  // After receiving headers, wait for the response to finish with a secondary timeout.
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
