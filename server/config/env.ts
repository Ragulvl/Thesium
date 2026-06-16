// Why: Uses stderr for error before logger is available (circular dep prevention).
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_API_KEYS: z.string().optional(), // comma-separated keys for rotation
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:10000'),
  BODY_LIMIT: z.string().default('1mb'),
  LOG_LEVEL: z.string().default('info'),
  SEED_SUPER_ADMIN_GOOGLE_SUB: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Cannot use logger here — it depends on env. Write to stderr instead.
  process.stderr.write(`❌ Invalid environment variables: ${JSON.stringify(parsedEnv.error.format(), null, 2)}\n`);
  process.exit(1);
}

export const env = parsedEnv.data;
