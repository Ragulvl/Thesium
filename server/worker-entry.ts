// Standalone worker entry for Docker worker container.
// Runs ONLY the BullMQ worker — no Express HTTP server.
import { closeWorker } from './workers/generation.worker.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';

logger.info({ role: 'worker', pid: process.pid }, 'Thesium worker started (standalone mode)');

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Worker ${signal}: shutting down gracefully...`);

  try {
    await closeWorker();
    logger.info('Worker closed');
  } catch (err) {
    logger.warn({ err }, 'Worker close error');
  }

  try {
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
  } catch (err) {
    logger.warn({ err }, 'Prisma disconnect error');
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
