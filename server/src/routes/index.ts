import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import authRoutes from './auth.routes';
import tenantRoutes from './tenant.routes';
import groupsRoutes from './groups.routes';
import settingsRoutes from './settings.routes';
import notificationsRoutes from './notifications.routes';
import usersRoutes from './users.routes';
import profileRoutes from './profile.routes';
import teamsRoutes from './teams.routes';
import probeRoutes from './probe.routes';
import importExportRoutes from './importExport.routes';
import smtpServerRoutes from './smtpServer.routes';
import appConfigRoutes from './appConfig.routes';
import twoFactorRoutes from './twoFactor.routes';
import { liveAlertRouter } from './liveAlert.routes';
import obliguardRoutes from './obliguard.routes';
import obliviewRoutes from './obliview.routes';
import oblianceRoutes from './obliance.routes';
import ssoRoutes from './sso.routes';
import siteRoutes from './site.routes';
import systemRoutes from './system.routes';
import vendorRulesRoutes from './vendorRules.routes';
import macVendorsRoutes from './macVendors.routes';

const router = Router();

// ── Global (no tenant required) ────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/probe', probeRoutes);           // probe push (API-key auth) + admin
router.use('/admin/config', appConfigRoutes);
router.use('/system', systemRoutes);         // system info / about (admin only, no tenant required)
router.use('/obliguard', obliguardRoutes);   // SSO cross-app
router.use('/obliview', obliviewRoutes);    // Obliview cross-app link
router.use('/obliance', oblianceRoutes);    // Obliance cross-app link
router.use('/sso', ssoRoutes);
router.use('/profile/2fa', twoFactorRoutes);

// ── Live alerts ──────────────────────────────────────────────────────────────
router.use('/live-alerts', liveAlertRouter);

// ── Tenant management ────────────────────────────────────────────────────────
router.use('/tenants', tenantRoutes);
router.use('/tenant', tenantRoutes);

// ── Tenant-scoped routes ─────────────────────────────────────────────────────
const tenantRouter = Router();
tenantRouter.use(requireAuth);
tenantRouter.use(requireTenant);

tenantRouter.use('/sites', siteRoutes);
tenantRouter.use('/vendor-rules', vendorRulesRoutes);
tenantRouter.use('/mac-vendors', macVendorsRoutes);
tenantRouter.use('/groups', groupsRoutes);
tenantRouter.use('/settings', settingsRoutes);
tenantRouter.use('/notifications', notificationsRoutes);
tenantRouter.use('/users', usersRoutes);
tenantRouter.use('/profile', profileRoutes);
tenantRouter.use('/teams', teamsRoutes);
tenantRouter.use('/admin', importExportRoutes);
tenantRouter.use('/admin/smtp-servers', smtpServerRoutes);

router.use('/', tenantRouter);

export { router as routes };
