import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Render provides a full REDIS_URL; local dev uses HOST + PORT
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const sharedOptions = {
  maxRetriesPerRequest: null as null, // Required by BullMQ
};

export const redisConnection = REDIS_URL
  ? new Redis(REDIS_URL, {
      ...sharedOptions,
      tls: REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : new Redis({
      ...sharedOptions,
      host: REDIS_HOST,
      port: REDIS_PORT,
    });

redisConnection.on('connect', () => {
  logger.info(`Successfully connected to Redis at ${REDIS_URL || `${REDIS_HOST}:${REDIS_PORT}`}`);
});

redisConnection.on('error', (error) => {
  logger.error(`Redis connection error: ${error.message}`);
});
