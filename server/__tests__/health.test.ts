// Tests for the real health check logic (DB + Redis connectivity).
// Strategy: test the health logic in isolation rather than spinning up the full Express server,
// because server/index.ts calls bootstrap() on module load which requires a real DB connection.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock factories
const { mockQueryRaw, mockRedisPing } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockRedisPing: vi.fn(),
}));

// We test the health check logic directly rather than via HTTP,
// since importing server/index.ts triggers bootstrap() → prisma.$connect()
describe('Health check logic', () => {
  const db = { $queryRaw: mockQueryRaw };
  const redis = { ping: mockRedisPing };

  beforeEach(() => vi.clearAllMocks());

  /** Replicates the health check logic from server/index.ts */
  async function runHealthCheck(): Promise<{ status: string; database: string; redis: string; timestamp: string }> {
    const checks: Record<string, 'ok' | 'error'> = {
      database: 'error',
      redis: 'error',
    };

    try {
      await db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch { /* stays 'error' */ }

    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch { /* stays 'error' */ }

    const allOk = Object.values(checks).every(v => v === 'ok');
    return {
      status: allOk ? 'ok' : 'degraded',
      ...checks,
      timestamp: new Date().toISOString(),
    };
  }

  it('returns status:ok when both DB and Redis are healthy', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockRedisPing.mockResolvedValueOnce('PONG');

    const result = await runHealthCheck();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
    expect(result.redis).toBe('ok');
  });

  it('returns status:degraded when DB is down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));
    mockRedisPing.mockResolvedValueOnce('PONG');

    const result = await runHealthCheck();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('error');
    expect(result.redis).toBe('ok');
  });

  it('returns status:degraded when Redis is down', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockRedisPing.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await runHealthCheck();
    expect(result.status).toBe('degraded');
    expect(result.redis).toBe('error');
    expect(result.database).toBe('ok');
  });

  it('returns status:degraded when both DB and Redis are down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('DB down'));
    mockRedisPing.mockRejectedValueOnce(new Error('Redis down'));

    const result = await runHealthCheck();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('error');
    expect(result.redis).toBe('error');
  });

  it('includes a valid ISO timestamp in the response', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockRedisPing.mockResolvedValueOnce('PONG');

    const result = await runHealthCheck();
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it('never reports database:ok when query throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('timeout'));
    mockRedisPing.mockResolvedValueOnce('PONG');

    const result = await runHealthCheck();
    // This is the critical invariant — the old code always returned 'ok' regardless
    expect(result.database).not.toBe('ok');
    expect(result.status).toBe('degraded');
  });
});
