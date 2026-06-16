// Why: Replace console.log/error with shared logger.
import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// Shared Redis client for BullMQ, Rate Limiting, caching, etc.
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis Connection Error');
});

redis.on('ready', () => {
  logger.info('Redis Connected');
});

export default redis;
