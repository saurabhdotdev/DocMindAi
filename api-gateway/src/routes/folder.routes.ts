import { Router } from 'express';
import { FolderController } from '../controllers/folder.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, FolderController.list);
router.post('/', authenticateJWT, FolderController.create);
router.put('/:id/share', authenticateJWT, FolderController.share);

export default router;
