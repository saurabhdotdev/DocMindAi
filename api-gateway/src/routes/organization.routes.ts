import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateJWT, OrganizationController.create);
router.get('/me', authenticateJWT, OrganizationController.getMyOrg);
router.post('/invite', authenticateJWT, OrganizationController.invite);
router.post('/accept/:token', authenticateJWT, OrganizationController.acceptInvite);
router.delete('/members/:userId', authenticateJWT, OrganizationController.removeMember);

export default router;
