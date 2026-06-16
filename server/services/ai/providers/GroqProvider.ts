// Groq AI Provider — wraps groq-sdk (OpenAI-compatible)
//
// Uses Groq's official SDK for fast inference on open-source models.
// Returns isAvailable() = false when GROQ_API_KEY is not set.

import Groq from 'groq-sdk';
import pRetry from 'p-retry';
import type { AIProvider, AIResponse, AIRequest, ProviderName } from '../types.js';
import { LLM_CALL_TIMEOUT_MS } from '../../../config/models.js';
import { logger as rootLogger } from '../../../config/logger.js';

// ── API Key Pool ─────────────────────────────────────────────────────

const allKeys: string[] = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

let currentKeyIndex = 0;

function getNextKey(): string {
  if (allKeys.length === 0) throw new Error('No Groq API keys configured');
  const key = allKeys[currentKeyIndex % allKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % allKeys.length;
  return key;
}

// ── Cost Estimation ──────────────────────────────────────────────────
// Groq pricing per 1M tokens (USD) — update as pricing changes.
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'llama-3.3-70b-versatile':         { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant':            { input: 0.05, output: 0.08 },
  'deepseek-r1-distill-llama-70b':   { input: 0.75, output: 0.99 },
  'llama-3.1-70b-versatile':         { input: 0.59, output: 0.79 },
  'gemma2-9b-it':                    { input: 0.20, output: 0.20 },
  'mixtral-8x7b-32768':              { input: 0.24, output: 0.24 },
};

function estimateCost(model: string, promptTokens: number, outputTokens: number): number {
  const pricing = COST_PER_1M[model] || { input: 0.50, output: 0.50 };
  return (promptTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ── Provider Implementation ──────────────────────────────────────────

class GroqProvider implements AIProvider {
  readonly name: ProviderName = 'groq';

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
      const apiKey = getNextKey();
      const client = new Groq({ apiKey });

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

        const promptTokens = completion.usage?.prompt_tokens ?? 0;
        const outputTokens = completion.usage?.completion_tokens ?? 0;
        const totalTokens = completion.usage?.total_tokens ?? (promptTokens + outputTokens);

        return {
          content: completion.choices[0]?.message?.content || '',
          provider: 'groq' as const,
          model,
          durationMs: Date.now() - start,
          promptTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd: estimateCost(model, promptTokens, outputTokens),
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      return await pRetry(run, {
        retries: Math.max(2, allKeys.length),
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 8000,
        onFailedAttempt: (err) => {
          callLogger.warn({ err: String(err), provider: 'groq', model, attempt: err.attemptNumber }, 'Groq attempt failed');
        },
      });
    } catch (error) {
      callLogger.error({ err: error, provider: 'groq', model }, 'All Groq retry attempts failed');
      throw error;
    }
  }
}

// ── Singleton Export ─────────────────────────────────────────────────

export const groqProvider = new GroqProvider();

if (allKeys.length > 0) {
  rootLogger.info(`Groq provider: ${allKeys.length} key(s) loaded`);
} else {
  rootLogger.info('Groq provider: no keys configured (disabled)');
}
