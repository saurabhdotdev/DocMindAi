import dotenv from 'dotenv';
// Load environment variables before importing other files
dotenv.config();

import WebSocket from 'ws';
// Polyfill global WebSocket for Supabase Realtime in older Node.js runtimes (Node < 22)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket as any;
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';
import { initializeBucket } from './config/storage';
import { startQueueWorker } from './jobs/worker';

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Security Middlewares
app.use(helmet());
app.use(
  cors({
    origin: '*', // Customize this with your frontend domain in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Request parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. HTTP Request logging middleware
app.use((req, res, next) => {
  logger.info(`HTTP Request - Method: ${req.method} | URL: ${req.url} | IP: ${req.ip}`);
  next();
});

// 4. Rate Limiter (Apply generally to all api routes)
app.use('/api', apiLimiter);

// 5. Mount API Routes
app.use('/api', routes);

// 6. 404 Route handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found - ${req.originalUrl}`,
  });
});

// 7. Global Error Handler Middleware
app.use(errorHandler);

// Start Express Server after S3 initialization and background worker boot
const startServer = async () => {
  try {
    await initializeBucket();
    startQueueWorker();
    const server = app.listen(PORT, () => {
      logger.info(`API Gateway started successfully in [${process.env.NODE_ENV || 'development'}] mode on port ${PORT}`);
    });

    // Handle graceful shutdowns
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Shutting down API Gateway gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error: any) {
    logger.error(`Failed to start API Gateway: ${error.message}`);
    process.exit(1);
  }
};

startServer();
