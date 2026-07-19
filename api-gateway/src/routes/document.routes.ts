import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { uploadMiddleware } from '../middleware/upload.middleware';

const router = Router();

// Secure all document endpoints
router.post('/upload', authenticateJWT, uploadMiddleware, DocumentController.upload);
router.get('/', authenticateJWT, DocumentController.list);
router.post('/chat', authenticateJWT, DocumentController.multiChat);
router.post('/compare', authenticateJWT, DocumentController.compare);
router.get('/:id', authenticateJWT, DocumentController.getById);
router.post('/:id/convert', authenticateJWT, DocumentController.convert);
router.post('/:id/chat', authenticateJWT, DocumentController.chat);
router.put('/:id/ocr', authenticateJWT, DocumentController.updateOcr);
router.post('/:id/translate', authenticateJWT, DocumentController.translate);
router.put('/:id/folder', authenticateJWT, DocumentController.assignFolder);
router.post('/:id/debate', authenticateJWT, DocumentController.debate);
router.post('/:id/podcast', authenticateJWT, DocumentController.podcast);
router.get('/:id/annotations', authenticateJWT, DocumentController.listAnnotations);
router.post('/:id/annotations', authenticateJWT, DocumentController.createAnnotation);
router.delete('/:id', authenticateJWT, DocumentController.delete);

export default router;
