import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/overview', authenticateJWT, AnalyticsController.overview);
router.get('/timeline', authenticateJWT, AnalyticsController.timeline);
router.get('/entities', authenticateJWT, AnalyticsController.entities);

export default router;
