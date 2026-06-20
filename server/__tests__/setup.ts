// Vitest global setup — runs before every test file.
//
// Problem 1: rate-limit-redis's RedisStore calls redisClient.call() on construction,
// which fails in test environments because the mock redisClient has no .call() method.
// This caused 3 unhandled rejections that polluted the test output, even in tests
// that had nothing to do with rate limiting.
//
// Fix: mock the entire rateLimiter module with passthrough middleware so it never
// tries to talk to Redis during tests. The rate limiting logic is Express middleware
// that should be tested via integration/e2e tests with a real Redis, not unit tests.
//
// Problem 2: auth.ts and auth.controller.ts capture CLIENT_ID at module-load time:
//   const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
// If neither env var is set, CLIENT_ID is undefined and every requireAuth / createSession
// call immediately returns 503 — before any auth logic runs — causing 11 test failures.
//
// Fix: stub VITE_GOOGLE_CLIENT_ID here, in the global setup file that executes before
// any test module is imported.  Setting it inside beforeEach() is too late because the
// module-level constant is already frozen by the time the test body runs.

import { vi } from 'vitest';

// Stub the Google Client ID so auth modules initialise with a truthy CLIENT_ID.
// Must be set before any test file imports auth.ts / auth.controller.ts.
process.env.VITE_GOOGLE_CLIENT_ID = 'test-google-client-id';

// Passthrough middleware — does nothing, calls next()
const passthrough = (_req: any, _res: any, next: () => void) => next();

vi.mock('../middleware/rateLimiter.js', () => ({
  apiLimiter: passthrough,
  aiGenerationLimiter: passthrough,
}));
