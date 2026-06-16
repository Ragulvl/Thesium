// AI Router — the single entry point for all AI calls in the pipeline
//
// Pipeline code calls:   aiRouter.generate({ stage, systemPrompt, userPrompt }, logger)
// The router handles:    provider selection, failover, health tracking, response normalization
//
// Provider-specific behavior NEVER leaks into pipeline code.

import type { AIRequest, AIResponse } from './types.js';
import { getRoutesForStage } from './stageRouter.js';
import { healthMonitor } from './healthMonitor.js';
import { logger as rootLogger } from '../../config/logger.js';

// ── Response Normalization ───────────────────────────────────────────
// Ensures every provider returns an identical AIResponse structure.
// Strips provider-specific artifacts (markdown fences from some providers,
// trailing whitespace differences, etc.)

function normalizeResponse(response: AIResponse): AIResponse {
  let content = response.content;

  // Strip markdown code fences that some providers add around JSON
  // (Gemini sometimes wraps output in ```json ... ```)
  if (content.startsWith('```')) {
    const firstNewline = content.indexOf('\n');
    const lastFence = content.lastIndexOf('```');
    if (firstNewline > 0 && lastFence > firstNewline) {
      content = content.slice(firstNewline + 1, lastFence).trim();
    }
  }

  // Normalize whitespace
  content = content.trim();

  return {
    ...response,
    content,
    // Ensure token counts are non-negative integers
    promptTokens: Math.max(0, Math.floor(response.promptTokens)),
    outputTokens: Math.max(0, Math.floor(response.outputTokens)),
    totalTokens: Math.max(0, Math.floor(response.totalTokens)),
    // Ensure cost is non-negative
    estimatedCostUsd: Math.max(0, response.estimatedCostUsd),
  };
}

// ── AI Router ────────────────────────────────────────────────────────

class AIRouterImpl {
  /**
   * Generate a completion by routing through the provider chain for the given stage.
   *
   * Behavior:
   * 1. Resolves the ordered provider chain for the stage
   * 2. Skips unavailable/unhealthy/over-budget providers
   * 3. Tries each provider in order until one succeeds
   * 4. Records health metrics (success/failure) per attempt
   * 5. Normalizes the response to prevent provider-specific leaks
   * 6. Throws only if ALL providers fail
   */
  async generate(request: AIRequest, callLogger: any): Promise<AIResponse> {
    const routes = getRoutesForStage(request.stage, request.maxCostUsd);

    if (routes.length === 0) {
      throw new Error(
        `No available providers for stage "${request.stage}". ` +
        `Check that at least one AI provider API key is configured.`
      );
    }

    const errors: Array<{ provider: string; model: string; error: unknown }> = [];

    for (const route of routes) {
      try {
        callLogger.debug(
          { provider: route.provider.name, model: route.model, stage: request.stage },
          `Routing AI call to ${route.provider.name}`
        );

        const response = await route.provider.generate(
          route.model,
          request.systemPrompt,
          request.userPrompt,
          callLogger,
          request.options,
        );

        // Record success
        healthMonitor.recordSuccess(route.provider.name, response.durationMs);

        // Normalize before returning — no provider leaks
        const normalized = normalizeResponse(response);

        callLogger.info(
          {
            provider: normalized.provider,
            model: normalized.model,
            stage: request.stage,
            durationMs: normalized.durationMs,
            tokens: normalized.totalTokens,
            cost: `$${normalized.estimatedCostUsd.toFixed(6)}`,
          },
          `AI call completed via ${normalized.provider}`
        );

        return normalized;
      } catch (error) {
        healthMonitor.recordFailure(route.provider.name, error);
        errors.push({ provider: route.provider.name, model: route.model, error });

        callLogger.warn(
          {
            provider: route.provider.name,
            model: route.model,
            stage: request.stage,
            err: error instanceof Error ? error.message : String(error),
          },
          `Provider ${route.provider.name} failed for stage "${request.stage}", trying next...`
        );
      }
    }

    // All providers failed
    const errorSummary = errors
      .map(e => `${e.provider}/${e.model}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join(' | ');

    callLogger.error(
      { stage: request.stage, errors: errors.length },
      `All providers failed for stage "${request.stage}"`
    );

    throw new Error(
      `All AI providers failed for stage "${request.stage}": ${errorSummary}`
    );
  }

  /** Get health stats for all providers (for admin dashboard / monitoring). */
  getProviderHealth() {
    return healthMonitor.getAllHealth();
  }
}

// ── Singleton Export ─────────────────────────────────────────────────

export const aiRouter = new AIRouterImpl();

rootLogger.info('AI Router initialized');
