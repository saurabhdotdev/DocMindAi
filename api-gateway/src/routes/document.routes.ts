import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { uploadMiddleware } from '../middleware/upload.middleware';

const router = Router();

// Secure all document endpoints
router.post('/upload', authenticateJWT, uploadMiddleware, DocumentController.upload);
router.get('/', authenticateJWT, DocumentController.list);
router.get('/:id', authenticateJWT, DocumentController.getById);
router.post('/:id/convert', authenticateJWT, DocumentController.convert);
router.post('/:id/chat', authenticateJWT, DocumentController.chat);
router.delete('/:id', authenticateJWT, DocumentController.delete);

export default router;
