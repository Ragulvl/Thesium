// Vitest configuration — server-side tests with coverage thresholds.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    setupFiles: ['server/__tests__/setup.ts'],

    // Coverage configuration — enforces minimum quality gates
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'server/controllers/**',
        'server/routes/**',
        'server/services/**',
        'server/middleware/**',
        'server/config/**',
      ],
      exclude: [
        'server/config/prisma.ts',      // Prisma client — not testable without DB
        'server/config/redis.ts',       // Redis client — not testable without Redis
        'server/config/bullboard.ts',   // BullMQ dashboard config
        'server/config/env.ts',         // Env validation — tested implicitly
        'server/config/logger.ts',      // Logger — tested implicitly
        'server/config/models.ts',      // Model constants — no logic
        'server/worker-entry.ts',
        'server/workers/**',
        // ── Express router files (integration-test only) ──────────────
        'server/routes/**',
        // ── External-API services (integration tests only) ──────────────
        'server/services/pipeline.ts',         // LLM orchestration — needs OpenRouter
        'server/services/thesisAuditor.ts',    // LLM audit — needs OpenRouter
        'server/services/scholar.ts',          // Semantic Scholar API
        'server/services/openRouter.ts',       // OpenRouter client
        'server/services/imageGenerator.ts',   // Image generation API
        'server/services/queue.ts',            // BullMQ queue — needs Redis
        'server/services/metrics.ts',          // Metrics counters — no logic
        // ── Controllers that require live DB to test meaningfully ─────
        'server/controllers/sections.controller.ts',
        'server/controllers/theses.controller.ts',
        'server/controllers/admin.controller.ts',
        'server/controllers/users.controller.ts',
        'server/controllers/usage.controller.ts',
        'server/controllers/payment.controller.ts',
        'server/controllers/coupon.controller.ts',
      ],
      // Realistic thresholds for unit-testable code (middleware + auth controller).
      // Middleware is already at ~59%. Raise incrementally as more controller
      // unit tests are added without requiring DB access.
      thresholds: {
        lines: 18,
        functions: 15,
        branches: 18,
        statements: 17,
      },
    },
  },
});
