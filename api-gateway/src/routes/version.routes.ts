import { Router } from 'express';
import { VersionController } from '../controllers/version.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { uploadMiddleware } from '../middleware/upload.middleware';

const router = Router({ mergeParams: true });

router.get('/', authenticateJWT, VersionController.list);
router.post('/', authenticateJWT, uploadMiddleware, VersionController.upload);

export default router;
