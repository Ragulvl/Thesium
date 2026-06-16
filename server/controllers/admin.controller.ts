// Fix: replaced req.log.error (undefined on plain Express Request) with module-level logger.
import { Request, Response } from 'express';
import { metrics } from '../services/metrics.js';
import { generationQueue } from '../services/queue.js';
import { logger } from '../config/logger.js';

export const getMetrics = async (_req: Request, res: Response) => {
  try {
    const currentMetrics = metrics.getMetrics();

    // Live Queue Status from BullMQ
    const [waiting, active, completed, failed] = await Promise.all([
      generationQueue.getWaitingCount(),
      generationQueue.getActiveCount(),
      generationQueue.getCompletedCount(),
      generationQueue.getFailedCount(),
    ]);

    return res.json({
      system: currentMetrics,
      queueStatus: { waiting, active, completed, failed },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch metrics');
    return res.status(500).json({ error: 'Failed to generate metrics' });
  }
};
