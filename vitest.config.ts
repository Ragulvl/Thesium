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
        'server/config/prisma.ts',  // Prisma client — not testable without DB
        'server/config/redis.ts',   // Redis client — not testable without Redis
        'server/config/bullboard.ts',
        'server/worker-entry.ts',
        'server/workers/**',        // Worker — tested separately
      ],
      // Minimum thresholds — CI fails if coverage drops below these
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 30,
        statements: 40,
      },
    },
  },
});
