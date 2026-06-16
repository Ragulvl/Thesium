import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisClient from '../config/redis.js';
import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 5000 : 300,
  standardHeaders: true, 
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - ioredis wrapper difference
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// AI Generation rate limiter — disabled in dev to avoid stale Redis counter issues
export const aiGenerationLimiter = isDev
  ? (_req: Request, _res: Response, next: NextFunction) => next() // passthrough in dev
  : rateLimit({
      windowMs: 60 * 1000,
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        // @ts-expect-error - ioredis wrapper difference
        sendCommand: (...args: string[]) => redisClient.call(...args),
      }),
      message: { error: 'Rate Limit Exceeded: Too many generation requests. Please wait a moment.' }
    });
