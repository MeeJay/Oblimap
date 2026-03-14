import { Router } from 'express';
import { siteController } from '../controllers/site.controller';

const router = Router();

// ── Sites ─────────────────────────────────────────────────────────────────────
router.get('/', siteController.list);
router.post('/', siteController.create);
router.get('/:id', siteController.get);
router.patch('/:id', siteController.update);
router.delete('/:id', siteController.remove);

// ── Items ─────────────────────────────────────────────────────────────────────
router.get('/:id/items', siteController.listItems);
router.post('/:id/items', siteController.createItem);
router.patch('/:id/items/:itemId', siteController.updateItem);
router.delete('/:id/items/:itemId', siteController.removeItem);

// ── IP Reservations ───────────────────────────────────────────────────────────
router.get('/:id/reservations', siteController.listReservations);
router.post('/:id/reservations', siteController.createReservation);
router.patch('/:id/reservations/:resId', siteController.updateReservation);
router.delete('/:id/reservations/:resId', siteController.removeReservation);

export default router;
