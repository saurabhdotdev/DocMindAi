import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, AgentController.list);
router.post('/', authenticateJWT, AgentController.create);
router.post('/optimize-prompt', authenticateJWT, AgentController.optimizePrompt);
router.delete('/:id', authenticateJWT, AgentController.delete);

export default router;
