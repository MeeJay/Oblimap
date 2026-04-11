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
import obligateCallbackRoutes from './obligateCallback.routes';
import oblitoolsRoutes from './oblitools.routes';
import siteRoutes from './site.routes';
import permissionSetsRoutes from './permissionSets.routes';
import systemRoutes from './system.routes';
import vendorRulesRoutes from './vendorRules.routes';
import macVendorsRoutes from './macVendors.routes';
import tunnelRoutes from './tunnel.routes';

const router = Router();

// ── Global (no tenant required) ────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/auth', obligateCallbackRoutes);   // Obligate SSO (sso-config, connected-apps, app-info)
router.use('/probe', probeRoutes);           // probe push (API-key auth) + admin
router.use('/admin/config', appConfigRoutes);
router.use('/system', systemRoutes);         // system info / about (admin only, no tenant required)
router.use('/oblitools', oblitoolsRoutes); // ObliTools desktop manifest (auth required)
router.use('/profile/2fa', twoFactorRoutes);
router.use('/permission-sets', permissionSetsRoutes);

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
tenantRouter.use('/tunnel', tunnelRoutes);

router.use('/', tenantRouter);

export { router as routes };
