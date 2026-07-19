import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, NotificationController.list);
router.put('/read-all', authenticateJWT, NotificationController.markAllRead);
router.put('/:id/read', authenticateJWT, NotificationController.markRead);

export default router;
