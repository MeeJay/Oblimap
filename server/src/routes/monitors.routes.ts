import { Router } from 'express';
import { monitorsController } from '../controllers/monitors.controller';
import { requireAuth } from '../middleware/auth';
import { requireMonitorWrite, requireCanCreate } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createMonitorSchema,
  updateMonitorSchema,
  bulkUpdateSchema,
} from '../validators/monitor.schema';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Read routes (visibility check in controller)
router.get('/summary', monitorsController.summary);
router.get('/heartbeats/all', monitorsController.allHeartbeats);
router.get('/', monitorsController.list);
router.get('/:id', monitorsController.getById);
router.get('/:id/heartbeats', monitorsController.heartbeats);
router.get('/:id/stats', monitorsController.stats);

// Bulk operations MUST be defined before /:id routes (otherwise /bulk matches /:id first)
router.patch('/bulk', validate(bulkUpdateSchema), monitorsController.bulkUpdate);
router.delete('/bulk', monitorsController.bulkDelete);
router.post('/bulk/pause', monitorsController.bulkPause);

// Write routes (permission-based: admin OR team RW)
router.post('/', requireCanCreate(), validate(createMonitorSchema), monitorsController.create);
router.put('/:id', requireMonitorWrite(), validate(updateMonitorSchema), monitorsController.update);
router.delete('/:id', requireMonitorWrite(), monitorsController.delete);
router.post('/:id/pause', requireMonitorWrite(), monitorsController.pause);

export default router;
