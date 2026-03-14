import { Router } from 'express';
import { vendorRulesController } from '../controllers/vendorRules.controller';

const router = Router();

router.get('/',     vendorRulesController.list);
router.post('/',    vendorRulesController.create);
router.patch('/:id', vendorRulesController.update);
router.delete('/:id', vendorRulesController.remove);

export default router;
