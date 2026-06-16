// Worker — dispatches two job types on the same queue:
//   "generate-section" → runAIPipeline  (per-section AI generation)
//   "audit-thesis"     → runThesisAudit (whole-thesis quality audit)
import { Worker } from 'bullmq';
import { runAIPipeline } from '../services/pipeline.js';
import { runThesisAudit } from '../services/thesisAuditor.js';
import { logger } from '../config/logger.js';
import { metrics } from '../services/metrics.js';
import redisClient from '../config/redis.js';

export const generationWorker = new Worker(
  'generation-queue',
  async job => {
    const startTime = Date.now();
    const waitTime = startTime - job.timestamp;
    metrics.recordQueueWait(waitTime);

    if (job.name === 'audit-thesis') {
      // ── Whole-Thesis Audit ───────────────────────────────────────
      const { thesisId } = job.data;
      logger.info(`🔍 Starting thesis audit: ${thesisId}`);

      try {
        const report = await runThesisAudit(thesisId, job, logger);
        const durationMs = Date.now() - startTime;
        metrics.recordQueueProcessing(durationMs);
        logger.info(`✅ Audit done for ${thesisId} in ${(durationMs / 1000).toFixed(0)}s`);
        return report;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        metrics.recordQueueProcessing(durationMs);
        logger.error(
          `Audit failed for ${thesisId} after ${(durationMs / 1000).toFixed(0)}s → ` +
          `${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    }

    // ── Section Generation (default) ────────────────────────────────
    const { thesisId, sectionId } = job.data;
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
    connection: redisClient,
    concurrency: 1,       // Sequential — each section needs context from previous ones
    lockDuration: 300000,
    limiter: { max: 10, duration: 60000 },
  }
);

generationWorker.on('failed', (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      jobName: job?.name,
      thesisId: job?.data?.thesisId,
      sectionId: job?.data?.sectionId,
      userId: job?.data?.userId,
      attempts: job?.attemptsMade,
      err: error,
    },
    `❌ Job "${job?.name}" permanently failed after ${job?.attemptsMade ?? '?'} attempts`
  );
});

generationWorker.on('completed', (job) => {
  logger.info(
    { jobId: job?.id, jobName: job?.name, thesisId: job?.data?.thesisId },
    `✅ Job "${job?.name}" completed`
  );
});

export async function closeWorker(): Promise<void> {
  await generationWorker.close();
}
