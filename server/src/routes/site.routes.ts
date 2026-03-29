import { Router } from 'express';
import { requireRole } from '../middleware/rbac';
import { siteController } from '../controllers/site.controller';

const router = Router();

// ── Sites ─────────────────────────────────────────────────────────────────────
router.get('/', siteController.list);
router.post('/', requireRole('admin'), siteController.create);
router.get('/:id', siteController.get);
router.patch('/:id', requireRole('admin'), siteController.update);
router.delete('/:id', requireRole('admin'), siteController.remove);

// ── Items ─────────────────────────────────────────────────────────────────────
router.get('/:id/items', siteController.listItems);
router.post('/:id/items', requireRole('admin'), siteController.createItem);
router.patch('/:id/items/:itemId', requireRole('admin'), siteController.updateItem);
router.delete('/:id/items-by-subnet', requireRole('admin'), siteController.removeSubnet);
router.delete('/:id/items/:itemId', requireRole('admin'), siteController.removeItem);

// ── Flows ────────────────────────────────────────────────────────────────────
router.get('/:id/flows', siteController.listFlows);

// ── IP Reservations ───────────────────────────────────────────────────────────
router.get('/:id/reservations', siteController.listReservations);
router.post('/:id/reservations', requireRole('admin'), siteController.createReservation);
router.patch('/:id/reservations/:resId', requireRole('admin'), siteController.updateReservation);
router.delete('/:id/reservations/:resId', requireRole('admin'), siteController.removeReservation);

export default router;
