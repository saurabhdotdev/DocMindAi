import { Router, Request, Response, NextFunction } from 'express';
import authRoutes from './auth.routes';
import documentRoutes from './document.routes';
import chatRoutes from './chat.routes';
import folderRoutes from './folder.routes';
import workflowRoutes from './workflow.routes';
import agentRoutes from './agent.routes';
import publicRoutes from './public.routes';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// API Version prefix
const API_PREFIX = '/v1';

// Health check endpoint (checks server and database status)
router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Perform simple database query
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      success: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date(),
    });
  } catch (error: any) {
    return next(new AppError(`Database health check failed: ${error.message}`, 500));
  }
});

// Mount routes
router.use(`${API_PREFIX}/auth`, authRoutes);
router.use(`${API_PREFIX}/documents`, documentRoutes);
router.use(`${API_PREFIX}/chats`, chatRoutes);
router.use(`${API_PREFIX}/folders`, folderRoutes);
router.use(`${API_PREFIX}/workflows`, workflowRoutes);
router.use(`${API_PREFIX}/agents`, agentRoutes);
router.use(`${API_PREFIX}/public`, publicRoutes);

export default router;
