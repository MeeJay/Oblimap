import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { appConfigService } from '../services/appConfig.service';
import { db } from '../db';

const router = Router();

/**
 * GET /api/obliview/link?uuid={uuid}
 *
 * Called by Obliview to look up a probe device in Oblimap by its UUID.
 * Returns the Oblimap page path for that probe.
 *
 * Auth: Bearer token — must match the configured obliview_config.apiKey.
 */
router.get('/link', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const cfg = await appConfigService.getObliviewConfig();
    if (!cfg?.apiKey || token !== cfg.apiKey) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { uuid } = req.query as { uuid?: string };
    if (!uuid) {
      res.status(400).json({ success: false, error: 'uuid is required' });
      return;
    }

    // Look up probe by UUID
    const probe = await db('probe_devices')
      .where({ uuid })
      .select('id', 'site_id')
      .first() as { id: number; site_id: number | null } | undefined;

    if (!probe) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    res.json({ success: true, data: { path: `/admin/probes/${probe.id}` } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/obliview/proxy-link?uuid={uuid}
 *
 * Called by Oblimap's client (session auth) to look up a device in Obliview.
 * The server proxies the request to the configured Obliview instance using the
 * stored API key, so the key is never exposed to the browser.
 */
router.get('/proxy-link', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cfg = await appConfigService.getObliviewConfig();
    if (!cfg?.url || !cfg.apiKey) {
      res.json({ success: true, data: { obliviewUrl: null } });
      return;
    }

    const { uuid } = req.query as { uuid?: string };
    if (!uuid) {
      res.status(400).json({ success: false, error: 'uuid is required' });
      return;
    }

    const base = cfg.url.replace(/\/$/, '');
    const lookupUrl = `${base}/api/obliview/link?uuid=${encodeURIComponent(uuid)}`;

    let fetchRes: Awaited<ReturnType<typeof fetch>>;
    try {
      fetchRes = await fetch(lookupUrl, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      res.json({ success: true, data: { obliviewUrl: null } });
      return;
    }

    if (!fetchRes.ok) {
      res.json({ success: true, data: { obliviewUrl: null } });
      return;
    }

    const body = await fetchRes.json() as { success: boolean; data?: { path: string } };
    if (!body.success || !body.data?.path) {
      res.json({ success: true, data: { obliviewUrl: null } });
      return;
    }

    res.json({ success: true, data: { obliviewUrl: `${base}${body.data.path}` } });
  } catch (err) {
    next(err);
  }
});

export default router;
