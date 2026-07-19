import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';
import { uploadMiddleware } from '../middleware/upload.middleware';

const router = Router();

router.post('/convert', uploadMiddleware, PublicController.convert);

export default router;
