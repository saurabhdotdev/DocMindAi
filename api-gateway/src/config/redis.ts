import Redis from 'ioredis';
import { logger } from '../utils/logger';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

export const redisConnection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

redisConnection.on('connect', () => {
  logger.info(`Successfully connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
});

redisConnection.on('error', (error) => {
  logger.error(`Redis connection error: ${error.message}`);
});
