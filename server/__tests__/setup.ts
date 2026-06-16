// Vitest global setup — runs before every test file.
//
// Problem: rate-limit-redis's RedisStore calls redisClient.call() on construction,
// which fails in test environments because the mock redisClient has no .call() method.
// This caused 3 unhandled rejections that polluted the test output, even in tests
// that had nothing to do with rate limiting.
//
// Fix: mock the entire rateLimiter module with passthrough middleware so it never
// tries to talk to Redis during tests. The rate limiting logic is Express middleware
// that should be tested via integration/e2e tests with a real Redis, not unit tests.

import { vi } from 'vitest';

// Passthrough middleware — does nothing, calls next()
const passthrough = (_req: any, _res: any, next: () => void) => next();

vi.mock('../middleware/rateLimiter.js', () => ({
  apiLimiter: passthrough,
  aiGenerationLimiter: passthrough,
}));
