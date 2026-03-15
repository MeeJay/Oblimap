import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { appConfigService } from '../services/appConfig.service';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/obliguard/link?uuid={uuid}
 *
 * Called by Obliguard (or any external service) to look up an agent device by
 * its machine UUID and get the Oblimap page path for that device.
 *
 * Auth: Bearer token — must match the configured obliguard_config.apiKey.
 * No session required (cross-service call).
 */
router.get('/link', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Bearer auth
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const cfg = await appConfigService.getObliguardRaw();
    if (!cfg || !cfg.apiKey || token !== cfg.apiKey) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { uuid } = req.query as { uuid?: string };
    if (!uuid) {
      res.status(400).json({ success: false, error: 'uuid is required' });
      return;
    }

    const device = await db('agent_devices')
      .where({ uuid })
      .select('id')
      .first() as { id: number } | undefined;

    if (!device) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    res.json({ success: true, data: { path: `/agents/${device.id}` } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/obliguard/proxy-link?uuid={uuid}
 *
 * Called by Oblimap's own client (session auth) to look up a device in Obliguard.
 * The server proxies the request to the configured Obliguard instance using the
 * stored API key, so the key is never exposed to the browser.
 *
 * Returns: { obliguardUrl: string } — full URL to the device page in Obliguard.
 * Returns: { obliguardUrl: null }   — device not found or Obliguard not configured.
 */
router.get('/proxy-link', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cfg = await appConfigService.getObliguardRaw();
    if (!cfg || !cfg.url || !cfg.apiKey) {
      res.json({ success: true, data: { obliguardUrl: null } });
      return;
    }

    const { uuid } = req.query as { uuid?: string };
    if (!uuid) {
      throw new AppError(400, 'uuid is required');
    }

    const base = cfg.url.replace(/\/$/, '');
    const lookupUrl = `${base}/api/obliguard/link?uuid=${encodeURIComponent(uuid)}`;

    let fetchRes: Awaited<ReturnType<typeof fetch>>;
    try {
      fetchRes = await fetch(lookupUrl, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (fetchErr) {
      console.error(`[obliguard proxy-link] Network error calling ${lookupUrl}:`, fetchErr);
      res.json({ success: true, data: { obliguardUrl: null } });
      return;
    }

    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => '');
      console.error(`[obliguard proxy-link] Obliguard returned HTTP ${fetchRes.status} for uuid=${uuid}: ${text}`);
      res.json({ success: true, data: { obliguardUrl: null } });
      return;
    }

    const body = await fetchRes.json() as { success: boolean; data?: { path: string } };
    if (!body.success || !body.data?.path) {
      console.error(`[obliguard proxy-link] Unexpected body for uuid=${uuid}:`, JSON.stringify(body));
      res.json({ success: true, data: { obliguardUrl: null } });
      return;
    }

    res.json({ success: true, data: { obliguardUrl: `${base}${body.data.path}` } });
  } catch (err) {
    next(err);
  }
});

export default router;
