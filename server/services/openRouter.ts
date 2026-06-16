// Why: Added per-call timeout, cost tracking, and multi-key rotation.
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { env } from '../config/env.js';
import { LLM_CALL_TIMEOUT_MS } from '../config/models.js';
import { logger } from '../config/logger.js';

// ── API Key Pool ─────────────────────────────────────────────────────
// Supports multiple keys via OPENROUTER_API_KEYS (comma-separated) or single OPENROUTER_API_KEY
const allKeys: string[] = (process.env.OPENROUTER_API_KEYS || env.OPENROUTER_API_KEY)
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

let currentKeyIndex = 0;
const exhaustedKeys = new Set<number>(); // indices of keys that hit rate limits
const keyCooldowns = new Map<number, number>(); // index → timestamp when key becomes available again

function getActiveKey(): string {
  // Reset exhausted keys whose cooldown has expired (60s cooldown)
  const now = Date.now();
  for (const idx of exhaustedKeys) {
    const cooldownEnd = keyCooldowns.get(idx) || 0;
    if (now > cooldownEnd) {
      exhaustedKeys.delete(idx);
      keyCooldowns.delete(idx);
    }
  }

  // Find next available key
  for (let i = 0; i < allKeys.length; i++) {
    const idx = (currentKeyIndex + i) % allKeys.length;
    if (!exhaustedKeys.has(idx)) {
      currentKeyIndex = idx;
      return allKeys[idx];
    }
  }

  // All keys exhausted — use current one anyway (will likely fail, but retries will wait)
  logger.warn(`All ${allKeys.length} API keys are rate-limited. Waiting for cooldown...`);
  return allKeys[currentKeyIndex];
}

function markKeyExhausted(key: string) {
  const idx = allKeys.indexOf(key);
  if (idx >= 0) {
    exhaustedKeys.add(idx);
    keyCooldowns.set(idx, Date.now() + 60_000); // 60s cooldown
    const remaining = allKeys.length - exhaustedKeys.size;
    logger.warn(`Key #${idx + 1} rate-limited → rotated (${remaining}/${allKeys.length} keys available)`);
    // Move to next key
    currentKeyIndex = (idx + 1) % allKeys.length;
  }
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL || "http://localhost:10000",
      "X-Title": "Thesium",
    }
  });
}

// Log how many keys are loaded
logger.info(`OpenRouter key pool: ${allKeys.length} key(s) loaded`);

/** Cost tracking: rough per-1K-token estimates (USD) for budgeting. */
const COST_PER_1K_TOKENS: Record<string, number> = {
  'nvidia/nemotron-nano-9b-v2:free': 0,
  'nvidia/nemotron-3-nano-30b-a3b:free': 0,
  'nvidia/nemotron-3-super-120b-a12b:free': 0,
  'stepfun/step-3.5-flash:free': 0,
};

export interface LLMCallResult {
  content: string;
  durationMs: number;
  estimatedCostUsd: number;
  totalTokens: number;  // actual token count from OpenRouter response
}

/**
 * Call OpenRouter model with exponential backoff retry, timeout, and key rotation.
 */
export async function callModelWithRetry(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  callLogger: any
): Promise<LLMCallResult> {
  const start = Date.now();

  const run = async () => {
    const apiKey = getActiveKey();
    const client = createClient(apiKey);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }, { signal: controller.signal as any });

      return completion;
    } catch (error: any) {
      // If rate limited (429), mark this key as exhausted and rotate
      if (error?.status === 429 || error?.message?.includes('rate limit') || error?.message?.includes('Rate limit')) {
        markKeyExhausted(apiKey);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const response = await pRetry(run, {
      retries: allKeys.length + 3, // more retries when we have more keys
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: () => {
        // Silent — key rotation logs when switching keys
      },
    });

    const totalTokens = response.usage?.total_tokens || 0;
    const costPer1K = COST_PER_1K_TOKENS[model] || 0.0005;
    const estimatedCostUsd = (totalTokens / 1000) * costPer1K;

    return {
      content: response.choices[0]?.message?.content || "",
      durationMs: Date.now() - start,
      estimatedCostUsd,
      totalTokens,
    };
  } catch (error) {
    callLogger.error({ err: error, model }, "All OpenRouter retry attempts failed");
    throw new Error(`AI Call Failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
