// Why: Single source of truth for env validation — Zod schema replaces manual validateEnv.ts.
// Added: RAZORPAY keys, GOOGLE_CLIENT_ID, LOG_LEVEL enum, OPENROUTER_API_KEYS.
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── Database ───────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),

  // ── Redis ──────────────────────────────────────────────────────
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // ── AI ─────────────────────────────────────────────────────────
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_API_KEYS: z.string().optional(), // comma-separated keys for rotation
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEYS: z.string().optional(),     // comma-separated keys for rotation
  GROQ_API_KEY: z.string().optional(),
  GROQ_API_KEYS: z.string().optional(),       // comma-separated keys for rotation

  // ── AI Router Toggle ───────────────────────────────────────────
  // Set to "false" to bypass AIRouter and use legacy openRouter.ts directly.
  // Safety rollback mechanism — remove after multi-provider is stable.
  USE_AI_ROUTER: z.string().default('true'),

  // ── Auth ────────────────────────────────────────────────────────
  // Use GOOGLE_CLIENT_ID for server-side verification.
  // VITE_GOOGLE_CLIENT_ID is kept for frontend build compatibility.
  GOOGLE_CLIENT_ID: z.string().optional(),
  VITE_GOOGLE_CLIENT_ID: z.string().optional(),

  // ── Payments ───────────────────────────────────────────────────
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // ── CORS & Request ──────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default('http://localhost:10000'),
  BODY_LIMIT: z.string().default('1mb'),

  // ── Logging ────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // ── Pipeline ───────────────────────────────────────────────────
  LLM_CALL_TIMEOUT_MS: z.string().optional(),
  MAX_JOB_COST_USD: z.string().optional(),
  FREE_THESIS_LIMIT: z.string().optional(),

  // ── Admin ──────────────────────────────────────────────────────
  SEED_SUPER_ADMIN_GOOGLE_SUB: z.string().optional(),

  // ── Docker role ────────────────────────────────────────────────
  THESIUM_ROLE: z.enum(['api', 'worker']).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  process.stderr.write(
    `❌ Invalid environment variables:\n${JSON.stringify(parsedEnv.error.format(), null, 2)}\n`
  );
  process.exit(1);
}

const env = parsedEnv.data;

/**
 * Validate that all required variables are present.
 * Called once at startup from server/index.ts.
 * Replaces the old validateEnv.ts manual check loop.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  // Always required
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');

  // Required in production
  if (env.NODE_ENV === 'production') {
    const prodRequired: Array<keyof typeof env> = [
      'REDIS_URL',
      'OPENROUTER_API_KEY',
      'ALLOWED_ORIGINS',
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
    ];
    for (const key of prodRequired) {
      if (!env[key]) missing.push(key);
    }

    // At least one of GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_ID must be set
    if (!env.GOOGLE_CLIENT_ID && !env.VITE_GOOGLE_CLIENT_ID) {
      missing.push('GOOGLE_CLIENT_ID (or VITE_GOOGLE_CLIENT_ID)');
    }
  }

  if (missing.length > 0) {
    const msg = `❌ Missing required environment variables: ${missing.join(', ')}`;
    // Use stderr directly — logger may not be ready yet
    process.stderr.write(msg + '\n');
    throw new Error(msg);
  }

  process.stderr.write(`✅ Environment validation passed (NODE_ENV=${env.NODE_ENV})\n`);
}

export { env };
