// Fixes applied:
// 1. Health check now tests actual DB and Redis connectivity (was always returning OK)
// 2. Worker dynamic import has .catch() to surface load failures
// 3. Graceful shutdown closes BullMQ queue before disconnecting Prisma
// 4. validateEnv() imported from env.ts (single source of truth)
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, validateEnv } from './config/env.js';
import { prisma } from './config/prisma.js';
import redisClient from './config/redis.js';
import { logger as baseLogger } from './config/logger.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { requireAuth, AuthenticatedRequest } from './middleware/auth.js';
import { generationQueue } from './services/queue.js';
import { serverAdapter as bullBoardAdapter } from './config/bullboard.js';

// Import Routes
import thesesRoutes from './routes/theses.routes.js';
import sectionsRoutes from './routes/sections.routes.js';
import usersRoutes from './routes/users.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import usageRoutes from './routes/usage.routes.js';

// Import Worker (only in combined mode — not in dedicated Docker worker container)
if (process.env.THESIUM_ROLE !== 'worker') {
  import('./workers/generation.worker.js').catch((err: unknown) => {
    baseLogger.error({ err }, 'Failed to load generation worker — queue processing disabled');
  });
}

// Validate environment before anything else
validateEnv();

const app = express();

// ── Security Middleware ──────────────────────────────────────────────
const FRONTEND_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:10000').split(',').map(o => o.trim());

app.use(helmet({
  crossOriginOpenerPolicy: false,   // Required: Google Sign-In uses popup/iframe postMessage
  crossOriginEmbedderPolicy: false, // Required: allows Google scripts to load
}));
app.use(cors({ origin: FRONTEND_ORIGINS, credentials: true }));
app.use(express.json({ limit: process.env.BODY_LIMIT || '1mb' }));

// ── Request Logging ──────────────────────────────────────────────────
// Only log mutations (POST/PUT/DELETE) and errors — hides polling GETs
app.use((req, res, next) => {
  const url = req.url || '';
  if (url === '/api/health' || url.includes('favicon')) return next();

  const start = Date.now();
  const originalEnd = res.end;

  res.end = function (...args: any[]) {
    const ms = Date.now() - start;
    const code = res.statusCode;
    const method = req.method;

    if (method !== 'GET' || code >= 400) {
      const color = code >= 500 ? '\x1b[31m' : code >= 400 ? '\x1b[33m' : '\x1b[32m';
      console.log(
        `\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m` +
        ` ${color}${method.padEnd(6)}\x1b[0m ${url} → ${color}${code}\x1b[0m \x1b[90m(${ms}ms)\x1b[0m`
      );
    }
    return originalEnd.apply(res, args as any);
  } as any;

  next();
});
app.use(metricsMiddleware);

// ── Health Check ─────────────────────────────────────────────────────
// Tests actual database and Redis connectivity — not a static response.
app.get('/api/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {
    database: 'error',
    redis: 'error',
  };

  // Test database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    baseLogger.warn('Health check: database unreachable');
  }

  // Test Redis
  try {
    await redisClient.ping();
    checks.redis = 'ok';
  } catch {
    baseLogger.warn('Health check: Redis unreachable');
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    ...checks,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ───────────────────────────────────────────────────────
app.use('/api/users', usersRoutes);
app.use('/api/theses', thesesRoutes);
app.use('/api/theses', sectionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/usage', usageRoutes);

// ── Bull Board Dashboard (Super Admin only) ──────────────────────────
app.use('/admin/queues', requireAuth, (req: AuthenticatedRequest, res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Requires Super Admin' });
  }
  next();
}, bullBoardAdapter.getRouter());

// ── Job Status Endpoint (protected) ─────────────────────────────────
app.get('/api/jobs/:jobId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const jobId = req.params.jobId as string;
  const job = await generationQueue.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  // Ownership check: job data must contain the requesting user's userId
  if (job.data?.userId && job.data.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const state = await job.getState();
  return res.json({
    id: job.id,
    state,
    returnvalue: state === 'completed' ? job.returnvalue : undefined,
    failedReason: state === 'failed' ? job.failedReason : undefined,
  });
});

// ── Global Error Handler ─────────────────────────────────────────────
app.use((err: any, req: any, res: any, _next: any) => {
  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues?.map((i: any) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  baseLogger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : (err.message || 'Error'),
  });
});

// ── Bootstrap ────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    baseLogger.info('Prisma connected to database');

    app.listen(env.PORT, () => {
      baseLogger.info(`Server running on http://localhost:${env.PORT}`);
    });
  } catch (err) {
    baseLogger.error({ err }, 'Failed to connect to database or start server');
    process.exit(1);
  }
}

bootstrap();

// ── Graceful Shutdown ────────────────────────────────────────────────
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  baseLogger.info(`${signal} received: shutting down gracefully`);

  try {
    // Close BullMQ queue first (stops accepting new jobs)
    await generationQueue.close();
    baseLogger.info('BullMQ queue closed');
  } catch (err) {
    baseLogger.warn({ err }, 'Failed to close BullMQ queue cleanly');
  }

  try {
    await prisma.$disconnect();
    baseLogger.info('Prisma disconnected');
  } catch (err) {
    baseLogger.warn({ err }, 'Failed to disconnect Prisma cleanly');
  }

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app };
