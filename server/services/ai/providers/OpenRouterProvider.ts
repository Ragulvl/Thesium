// OpenRouter AI Provider — refactored from openRouter.ts into provider interface
//
// Preserves the existing multi-key rotation, cooldown, and rate-limit detection
// logic from the original openRouter.ts implementation.

import OpenAI from 'openai';
import pRetry from 'p-retry';
import type { AIProvider, AIResponse, AIRequest, ProviderName } from '../types.js';
import { env } from '../../../config/env.js';
import { LLM_CALL_TIMEOUT_MS } from '../../../config/models.js';
import { logger as rootLogger } from '../../../config/logger.js';

// ── API Key Pool (preserved from original openRouter.ts) ─────────────

const allKeys: string[] = (process.env.OPENROUTER_API_KEYS || env.OPENROUTER_API_KEY)
  .split(',')
  .map((k: string) => k.trim())
  .filter((k: string) => k.length > 0);

let currentKeyIndex = 0;
const exhaustedKeys = new Set<number>();
const keyCooldowns = new Map<number, number>(); // index → timestamp

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

  // All keys exhausted — use current one anyway
  rootLogger.warn(`All ${allKeys.length} OpenRouter keys are rate-limited. Waiting for cooldown...`);
  return allKeys[currentKeyIndex];
}

function markKeyExhausted(key: string) {
  const idx = allKeys.indexOf(key);
  if (idx >= 0) {
    exhaustedKeys.add(idx);
    keyCooldowns.set(idx, Date.now() + 60_000);
    const remaining = allKeys.length - exhaustedKeys.size;
    rootLogger.warn(`OpenRouter key #${idx + 1} rate-limited → rotated (${remaining}/${allKeys.length} available)`);
    currentKeyIndex = (idx + 1) % allKeys.length;
  }
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:10000',
      'X-Title': 'Thesium',
    },
  });
}

// ── Cost Estimation ──────────────────────────────────────────────────
const COST_PER_1K_TOKENS: Record<string, number> = {
  'nvidia/nemotron-nano-9b-v2:free': 0,
  'nvidia/nemotron-3-nano-30b-a3b:free': 0,
  'nvidia/nemotron-3-super-120b-a12b:free': 0,
  'stepfun/step-3.5-flash:free': 0,
};

// ── Provider Implementation ──────────────────────────────────────────

class OpenRouterProvider implements AIProvider {
  readonly name: ProviderName = 'openrouter';

  isAvailable(): boolean {
    return allKeys.length > 0;
  }

  async generate(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    callLogger: any,
    options?: AIRequest['options'],
  ): Promise<AIResponse> {
    const start = Date.now();

    const run = async () => {
      const apiKey = getActiveKey();
      const client = createClient(apiKey);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS);

      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
          },
          { signal: controller.signal as any },
        );

        return completion;
      } catch (error: any) {
        // Rate limit detection — mark this key as exhausted and rotate
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
        retries: allKeys.length + 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (err) => {
          callLogger.warn({ err: String(err), provider: 'openrouter', model, attempt: err.attemptNumber }, 'OpenRouter attempt failed');
        },
      });

      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const totalTokens = response.usage?.total_tokens ?? (promptTokens + outputTokens);
      const costPer1K = COST_PER_1K_TOKENS[model] || 0.0005;

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'openrouter' as const,
        model,
        durationMs: Date.now() - start,
        promptTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd: (totalTokens / 1000) * costPer1K,
      };
    } catch (error) {
      callLogger.error({ err: error, provider: 'openrouter', model }, 'All OpenRouter retry attempts failed');
      throw error;
    }
  }
}

// ── Singleton Export ─────────────────────────────────────────────────

export const openRouterProvider = new OpenRouterProvider();

rootLogger.info(`OpenRouter provider: ${allKeys.length} key(s) loaded`);
