import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

// Secure all chat routes with JWT authentication
router.get('/', authenticateJWT, ChatController.list);
router.post('/', authenticateJWT, ChatController.create);
router.get('/:id/messages', authenticateJWT, ChatController.getHistory);
router.post('/:id/messages', authenticateJWT, ChatController.sendMessage);

export default router;
