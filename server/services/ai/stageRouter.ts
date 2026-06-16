// Stage-Based AI Router — maps pipeline stages to provider+model chains
//
// Each stage has an ordered fallback chain. The router filters out
// unavailable providers (no API key) and unhealthy providers (circuit open).
// Budget-aware filtering: if AIRequest.maxCostUsd is set, expensive providers
// are skipped for that call.

import type { PipelineStage, StageRouteEntry, ProviderName } from './types.js';
import { MODELS, PROVIDER_MODELS } from '../../config/models.js';
import { geminiProvider } from './providers/GeminiProvider.js';
import { groqProvider } from './providers/GroqProvider.js';
import { openRouterProvider } from './providers/OpenRouterProvider.js';
import { healthMonitor } from './healthMonitor.js';
import type { AIProvider } from './types.js';

// ── Provider Registry ────────────────────────────────────────────────

const PROVIDERS: Record<ProviderName, AIProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  openrouter: openRouterProvider,
};

// ── Stage → Provider+Model Routing Table ─────────────────────────────
// Order = priority. First healthy + available + within-budget provider wins.
// Updated per user feedback: Gemini-first for draft stage.

const STAGE_ROUTING: Record<PipelineStage, StageRouteEntry[]> = {
  'blueprint': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.fast,       costPer1kTokens: 0.0004 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
    { provider: 'openrouter', model: MODELS.FAST,                      costPer1kTokens: 0 },
  ],

  'research-queries': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.lite,       costPer1kTokens: 0 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.lite,        costPer1kTokens: 0.00006 },
    { provider: 'openrouter', model: MODELS.FAST,                      costPer1kTokens: 0 },
  ],

  'outline': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.fast,       costPer1kTokens: 0.0004 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
    { provider: 'openrouter', model: MODELS.DRAFTER,                   costPer1kTokens: 0 },
  ],

  // Draft: Gemini Pro first — this stage produces 80% of content quality
  'draft': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.pro,        costPer1kTokens: 0.010 },
    { provider: 'openrouter', model: MODELS.DRAFTER,                   costPer1kTokens: 0 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.reasoning,   costPer1kTokens: 0.0009 },
  ],

  'citation-validation': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.fast,       costPer1kTokens: 0.0004 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
    { provider: 'openrouter', model: MODELS.FAST,                      costPer1kTokens: 0 },
  ],

  'review': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.pro,        costPer1kTokens: 0.010 },
    { provider: 'openrouter', model: MODELS.LARGE,                     costPer1kTokens: 0 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
  ],

  'polish': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.fast,       costPer1kTokens: 0.0004 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
    { provider: 'openrouter', model: MODELS.MEDIUM,                    costPer1kTokens: 0 },
  ],

  'audit': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.pro,        costPer1kTokens: 0.010 },
    { provider: 'openrouter', model: MODELS.LARGE,                     costPer1kTokens: 0 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.fast,        costPer1kTokens: 0.0007 },
  ],

  'image': [
    { provider: 'gemini',     model: PROVIDER_MODELS.gemini.fast,       costPer1kTokens: 0.0004 },
    { provider: 'groq',       model: PROVIDER_MODELS.groq.lite,        costPer1kTokens: 0.00006 },
    { provider: 'openrouter', model: MODELS.FAST,                      costPer1kTokens: 0 },
  ],
};

// ── Public API ───────────────────────────────────────────────────────

export interface ResolvedRoute {
  provider: AIProvider;
  model: string;
  costPer1kTokens: number;
}

/**
 * Get the ordered list of provider+model pairs for a pipeline stage.
 * Filters out:
 * - Providers with no API keys configured
 * - Providers with an open circuit breaker
 * - Providers whose estimated cost exceeds the budget cap (if set)
 */
export function getRoutesForStage(stage: PipelineStage, maxCostUsd?: number): ResolvedRoute[] {
  const entries = STAGE_ROUTING[stage];
  if (!entries) throw new Error(`Unknown pipeline stage: ${stage}`);

  return entries
    .filter(entry => {
      const provider = PROVIDERS[entry.provider];
      if (!provider) return false;
      if (!provider.isAvailable()) return false;
      if (!healthMonitor.isHealthy(entry.provider)) return false;

      // Budget-aware filtering: rough estimate assuming ~2K tokens per call
      if (maxCostUsd !== undefined && entry.costPer1kTokens > 0) {
        const estimatedCallCost = entry.costPer1kTokens * 2; // ~2K tokens
        if (estimatedCallCost > maxCostUsd) return false;
      }

      return true;
    })
    .map(entry => ({
      provider: PROVIDERS[entry.provider],
      model: entry.model,
      costPer1kTokens: entry.costPer1kTokens,
    }));
}
