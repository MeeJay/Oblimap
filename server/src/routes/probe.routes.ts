import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { probeController } from '../controllers/probe.controller';

const router = Router();

// ── Probe Push — API-key authenticated, no session required ──────────────────
router.post('/push', probeController.push);

// ── Tenant-scoped admin endpoints — session + tenant required ─────────────────
router.use(requireAuth);
router.use(requireTenant);

// API Keys
router.get('/keys', probeController.listKeys);
router.post('/keys', probeController.createKey);
router.delete('/keys/:id', probeController.deleteKey);

// Probes list + bulk
router.get('/devices', probeController.list);
router.post('/devices/bulk', probeController.bulk);

// Single probe operations
router.get('/devices/:id', probeController.get);
router.patch('/devices/:id', probeController.update);
router.delete('/devices/:id', probeController.remove);
router.post('/devices/:id/approve', probeController.approve);
router.post('/devices/:id/refuse', probeController.refuse);
router.post('/devices/:id/command', probeController.sendCommand);

export default router;
