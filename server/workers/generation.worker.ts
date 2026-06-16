// Minimal worker — logs only section start and final result.
import { Worker } from 'bullmq';
import { runAIPipeline } from '../services/pipeline.js';
import { logger } from '../config/logger.js';
import { metrics } from '../services/metrics.js';

export const generationWorker = new Worker('generation-queue', async job => {
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
    logger.error(`Section "${sectionId}" failed after ${(durationMs / 1000).toFixed(0)}s → ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

}, {
  connection: {
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
  },
  concurrency: 1, // Sequential: each section needs context from previous ones
  lockDuration: 300000,
  limiter: {
    max: 10,
    duration: 60000
  }
});

// No duplicate completed/failed events — pipeline already logs them
generationWorker.on('failed', () => {});
generationWorker.on('completed', () => {});
