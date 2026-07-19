import { Router } from 'express';
import { SearchController } from '../controllers/search.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateJWT, SearchController.semanticSearch);

export default router;
