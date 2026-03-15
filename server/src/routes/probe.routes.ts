import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import {
  probeController,
  probeVersion,
  probeDownload,
  probeInstallerLinux,
  probeInstallerMacos,
  probeInstallerWindowsMsi,
  probeNotifyingUpdate,
} from '../controllers/probe.controller';

const router = Router();

// ── Public routes (no session auth required) ─────────────────────────────────

// Probe push — API-key authenticated
router.post('/push', probeController.push);

// Pre-update notification — probe calls this before self-updating
router.post('/notifying-update', probeNotifyingUpdate);

// Auto-update endpoints
router.get('/version', probeVersion);
router.get('/download/:filename', probeDownload);

// Installer scripts (with API key injected server-side)
router.get('/installer/linux', probeInstallerLinux);
router.get('/installer/macos', probeInstallerMacos);

// Pre-built Windows MSI (static, SERVERURL + APIKEY passed via msiexec properties)
router.get('/installer/windows.msi', probeInstallerWindowsMsi);

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
