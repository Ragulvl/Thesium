// Why: Integration tests for the /api/health endpoint — verifies it returns
// real DB/Redis status and correct HTTP codes (200 for OK, 503 for degraded).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks before imports
const { mockQueryRaw, mockRedisPing } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockRedisPing: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

vi.mock('../config/redis.js', () => ({
  default: { ping: mockRedisPing },
}));

// Import AFTER mocks are set up
const { app } = await import('../index.js');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and status:ok when both DB and Redis are healthy', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockRedisPing.mockResolvedValueOnce('PONG');

    const res = await fetch('http://localhost:3001/api/health');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.redis).toBe('ok');
  });

  it('returns 503 and status:degraded when DB is down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));
    mockRedisPing.mockResolvedValueOnce('PONG');

    const res = await fetch('http://localhost:3001/api/health');
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
    expect(body.redis).toBe('ok');
  });

  it('returns 503 and status:degraded when Redis is down', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockRedisPing.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const res = await fetch('http://localhost:3001/api/health');
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.redis).toBe('error');
  });

  it('includes a timestamp in the response', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockRedisPing.mockResolvedValueOnce('PONG');

    const res = await fetch('http://localhost:3001/api/health');
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});
