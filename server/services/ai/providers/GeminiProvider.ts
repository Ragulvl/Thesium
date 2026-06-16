// Gemini AI Provider — wraps @google/generative-ai SDK
//
// Uses Google's official SDK for Gemini models.
// Returns isAvailable() = false when GEMINI_API_KEY is not set.

import { GoogleGenerativeAI } from '@google/generative-ai';
import pRetry from 'p-retry';
import type { AIProvider, AIResponse, AIRequest, ProviderName } from '../types.js';
import { LLM_CALL_TIMEOUT_MS } from '../../../config/models.js';
import { logger as rootLogger } from '../../../config/logger.js';

// ── API Key Pool ─────────────────────────────────────────────────────

const allKeys: string[] = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

let currentKeyIndex = 0;

function getNextKey(): string {
  if (allKeys.length === 0) throw new Error('No Gemini API keys configured');
  const key = allKeys[currentKeyIndex % allKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % allKeys.length;
  return key;
}

// ── Cost Estimation ──────────────────────────────────────────────────
// Approximate costs per 1M tokens (USD) — update as Gemini pricing changes.
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash':      { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.0,  output: 0.0  },  // Free tier
  'gemini-2.5-pro':        { input: 1.25, output: 10.0 },
  'gemini-2.5-flash':      { input: 0.15, output: 0.60 },
};

function estimateCost(model: string, promptTokens: number, outputTokens: number): number {
  const pricing = COST_PER_1M[model] || { input: 0.50, output: 2.0 };
  return (promptTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ── Provider Implementation ──────────────────────────────────────────

class GeminiProvider implements AIProvider {
  readonly name: ProviderName = 'gemini';

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
      const genAI = new GoogleGenerativeAI(apiKey);

      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: options?.temperature,
          maxOutputTokens: options?.maxTokens,
        },
      });

      // AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS);

      try {
        const result = await genModel.generateContent(
          { contents: [{ role: 'user', parts: [{ text: userPrompt }] }] },
          { signal: controller.signal as any },
        );

        const response = result.response;
        const text = response.text();
        const usage = response.usageMetadata;

        const promptTokens = usage?.promptTokenCount ?? 0;
        const outputTokens = usage?.candidatesTokenCount ?? 0;
        const totalTokens = usage?.totalTokenCount ?? (promptTokens + outputTokens);

        return {
          content: text,
          provider: 'gemini' as const,
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
          callLogger.warn({ err: String(err), provider: 'gemini', model, attempt: err.attemptNumber }, 'Gemini attempt failed');
        },
      });
    } catch (error) {
      callLogger.error({ err: error, provider: 'gemini', model }, 'All Gemini retry attempts failed');
      throw error;
    }
  }
}

// ── Singleton Export ─────────────────────────────────────────────────

export const geminiProvider = new GeminiProvider();

if (allKeys.length > 0) {
  rootLogger.info(`Gemini provider: ${allKeys.length} key(s) loaded`);
} else {
  rootLogger.info('Gemini provider: no keys configured (disabled)');
}
