import { Router } from 'express';
import { groupsController } from '../controllers/groups.controller';
import { requireAuth } from '../middleware/auth';
import { requireRole, requireGroupWrite, requireCanCreate } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createGroupSchema,
  updateGroupSchema,
  moveGroupSchema,
} from '../validators/group.schema';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Read routes (visibility filtering in controller)
router.get('/', groupsController.list);
router.get('/tree', groupsController.tree);
router.get('/stats', groupsController.stats);
router.get('/:id', groupsController.getById);
router.get('/:id/monitors', groupsController.getMonitors);
router.get('/:id/heartbeats', groupsController.heartbeats);
router.get('/:id/detail-stats', groupsController.groupDetailStats);
router.get('/:id/probes', groupsController.getGroupProbes);

// Write routes (permission-based: admin OR team RW)
router.post('/', requireCanCreate(), validate(createGroupSchema), groupsController.create);
router.put('/:id', requireGroupWrite(), validate(updateGroupSchema), groupsController.update);
router.post('/reorder', requireRole('admin'), groupsController.reorder);
router.post('/:id/move', requireGroupWrite(), validate(moveGroupSchema), groupsController.move);
router.delete('/:id', requireGroupWrite(), groupsController.delete);
router.delete('/:id/heartbeats', requireGroupWrite(), groupsController.clearHeartbeats);
router.patch('/:id/agent-config', requireRole('admin'), groupsController.updateAgentGroupConfig);

export default router;
