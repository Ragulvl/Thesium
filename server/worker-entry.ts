// Why: Standalone worker entry for Docker worker container — runs ONLY the BullMQ worker, no Express server.
import './workers/generation.worker.js';
import { logger } from './config/logger.js';

logger.info({ role: 'worker', pid: process.pid }, 'Thesium worker started (standalone mode)');

// Graceful shutdown
const shutdown = () => {
  logger.info('Worker shutting down...');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
