import { Request, Response } from 'express';
import { metrics } from '../services/metrics.js';
import { generationQueue } from '../services/queue.js';

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const currentMetrics = metrics.getMetrics();
    
    // Live Queue Status from BullMQ
    const waiting = await generationQueue.getWaitingCount();
    const active = await generationQueue.getActiveCount();
    const completed = await generationQueue.getCompletedCount();
    const failed = await generationQueue.getFailedCount();

    return res.json({
      system: currentMetrics,
      queueStatus: {
        waiting,
        active,
        completed,
        failed
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to fetch metrics');
    return res.status(500).json({ error: 'Failed to generate metrics' });
  }
};
