import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    'error', 
    'warn'
  ],
});

import { logger } from './logger.js';
import { metrics } from '../services/metrics.js';

// Catch slow queries — only log really slow ones (>2s)
if (!global.prisma) {
  prisma.$on('query' as never, (e: any) => {
    if (e.duration > 2000) {
      metrics.recordSlowQuery();
      logger.warn(`Slow DB query (${e.duration}ms)`);
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
