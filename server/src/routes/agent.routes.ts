import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { agentAuth } from '../middleware/agentAuth';
import {
  agentPush,
  agentVersion,
  agentDownload,
  agentInstallerLinux,
  agentInstallerWindows,
  agentInstallerWindowsMsi,
  listKeys,
  createKey,
  deleteKey,
  listDevices,
  updateDevice,
  deleteDevice,
} from '../controllers/agent.controller';

const router = Router();

// ── Public routes (no session auth required) ──────────────────────────────────

// Agent push — authenticated via X-API-Key header
router.post('/push', agentAuth, agentPush);

// Agent auto-update endpoints
router.get('/version', agentVersion);
router.get('/download/:filename', agentDownload);

// Installer scripts (with API key injected)
router.get('/installer/linux', agentInstallerLinux);
router.get('/installer/windows', agentInstallerWindows);

// Pre-built Windows MSI (static, SERVERURL + APIKEY passed via msiexec properties)
router.get('/installer/windows.msi', agentInstallerWindowsMsi);

// ── Admin routes (session auth + admin role required) ─────────────────────────

router.get('/keys', requireAuth, requireRole('admin'), listKeys);
router.post('/keys', requireAuth, requireRole('admin'), createKey);
router.delete('/keys/:id', requireAuth, requireRole('admin'), deleteKey);

router.get('/devices', requireAuth, requireRole('admin'), listDevices);
router.patch('/devices/:id', requireAuth, requireRole('admin'), updateDevice);
router.delete('/devices/:id', requireAuth, requireRole('admin'), deleteDevice);

export default router;
