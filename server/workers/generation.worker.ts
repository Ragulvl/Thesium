// Fixes:
// 1. Use the shared ioredis client from config/redis.ts instead of parsing REDIS_URL independently
//    (eliminates duplicate connection, makes URL changes apply everywhere)
// 2. Failed job event now logs actionable details instead of being a silent no-op
// 3. Added graceful shutdown export for worker-entry.ts to close worker cleanly
import { Worker } from 'bullmq';
import { runAIPipeline } from '../services/pipeline.js';
import { logger } from '../config/logger.js';
import { metrics } from '../services/metrics.js';
import redisClient from '../config/redis.js';

export const generationWorker = new Worker(
  'generation-queue',
  async job => {
    const { thesisId, sectionId } = job.data;
    const startTime = Date.now();
    const waitTime = startTime - job.timestamp;
    metrics.recordQueueWait(waitTime);

    logger.info(`🚀 Generating "${sectionId}" section...`);

    try {
      const result = await runAIPipeline(thesisId, sectionId, job, logger);
      const durationMs = Date.now() - startTime;
      metrics.recordQueueProcessing(durationMs);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      metrics.recordQueueProcessing(durationMs);
      logger.error(
        `Section "${sectionId}" failed after ${(durationMs / 1000).toFixed(0)}s → ` +
        `${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  },
  {
    // Use the shared ioredis instance instead of parsing REDIS_URL independently.
    // BullMQ v5+ accepts an ioredis connection directly.
    connection: redisClient,
    concurrency: 1,     // Sequential: each section builds on previous section's context
    lockDuration: 300000,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

// Log permanent failures with full context for debugging / alerting.
generationWorker.on('failed', (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      thesisId: job?.data?.thesisId,
      sectionId: job?.data?.sectionId,
      userId: job?.data?.userId,
      attempts: job?.attemptsMade,
      err: error,
    },
    `❌ Generation job permanently failed after ${job?.attemptsMade ?? '?'} attempts`
  );
});

generationWorker.on('completed', (job) => {
  logger.info(
    { jobId: job?.id, sectionId: job?.data?.sectionId },
    `✅ Job completed`
  );
});

/**
 * Close the worker gracefully.
 * Call this during SIGTERM/SIGINT before process.exit().
 */
export async function closeWorker(): Promise<void> {
  await generationWorker.close();
}
