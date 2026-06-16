// Why: Fail fast if critical env vars are missing — prevents silent misconfigurations in production.
import { logger } from './logger.js';

const REQUIRED_VARS = [
  'DATABASE_URL',
] as const;

const REQUIRED_IN_PRODUCTION = [
  'REDIS_URL',
  'OPENROUTER_API_KEY',
  'VITE_GOOGLE_CLIENT_ID',
  'ALLOWED_ORIGINS',
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) missing.push(key);
    }
  }

  if (missing.length > 0) {
    const msg = `❌ Missing required environment variables: ${missing.join(', ')}`;
    logger.fatal({ missing }, msg);
    throw new Error(msg);
  }

  logger.info({ nodeEnv: process.env.NODE_ENV || 'development' }, '✅ Environment validation passed');
}
