import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate, authenticateJWT } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter';
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validation/auth.validation';

const router = Router();

// Apply auth limiter to credentials submission
router.post('/signup', authLimiter, validate(signupSchema), AuthController.signup);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', validate(refreshSchema), AuthController.refresh);
router.post('/logout', AuthController.logout);

router.get('/verify-email', validate(verifyEmailSchema), AuthController.verifyEmail);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), AuthController.resetPassword);

// Test Authenticated Route
router.get('/me', authenticateJWT, AuthController.getMe);

export default router;
