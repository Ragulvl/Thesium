import { Request, Response, NextFunction } from 'express';
import { metrics } from '../services/metrics.js';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only track API requests, skip assets/health checks if needed
  if (!req.path.startsWith('/api/') || req.path === '/api/health') {
    return next();
  }

  const start = Date.now();

  // Wait for request to finish explicitly
  res.on('finish', () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;
    metrics.recordRequest(duration, isError);
  });

  next();
};
