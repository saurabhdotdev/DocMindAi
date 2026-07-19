import { Router } from 'express';
import { WorkflowController } from '../controllers/workflow.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, WorkflowController.list);
router.post('/', authenticateJWT, WorkflowController.create);
router.put('/:id/toggle', authenticateJWT, WorkflowController.toggle);
router.delete('/:id', authenticateJWT, WorkflowController.delete);

export default router;
