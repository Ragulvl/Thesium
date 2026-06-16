// AI Orchestration Layer — Shared Types
//
// All pipeline code uses these types. Provider-specific details
// never leak beyond provider implementations.

// ── Pipeline Stages ──────────────────────────────────────────────────
// Each stage maps to an ordered list of provider+model pairs in stageRouter.ts

export type PipelineStage =
  | 'blueprint'
  | 'research-queries'
  | 'outline'
  | 'draft'
  | 'citation-validation'
  | 'review'
  | 'polish'
  | 'audit'
  | 'image';

// ── Provider Names ───────────────────────────────────────────────────

export type ProviderName = 'gemini' | 'groq' | 'openrouter';

// ── Request / Response ───────────────────────────────────────────────

export interface AIRequest {
  /** Which pipeline stage this call serves — determines provider routing. */
  stage: PipelineStage;
  systemPrompt: string;
  userPrompt: string;
  /** Optional budget cap for this individual call (USD). Router will skip
   *  providers whose estimated cost exceeds this threshold. */
  maxCostUsd?: number;
  /** Optional generation parameters. */
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export interface AIResponse {
  content: string;
  provider: ProviderName;
  model: string;
  durationMs: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

// ── Provider Interface ───────────────────────────────────────────────
// Every provider (Gemini, Groq, OpenRouter) implements this contract.

export interface AIProvider {
  readonly name: ProviderName;

  /** Returns true if the provider has valid API keys configured. */
  isAvailable(): boolean;

  /** Generate a completion. Implementations handle their own retries. */
  generate(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    logger: any,
    options?: AIRequest['options'],
  ): Promise<AIResponse>;
}

// ── Stage Route Entry ────────────────────────────────────────────────

export interface StageRouteEntry {
  provider: ProviderName;
  model: string;
  /** Estimated cost per 1K tokens (USD) — used for budget-aware filtering. */
  costPer1kTokens: number;
}

// ── Provider Health ──────────────────────────────────────────────────

export interface ProviderHealth {
  provider: ProviderName;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  avgLatencyMs: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  /** When true, the circuit breaker is open — skip this provider. */
  circuitOpen: boolean;
  /** Timestamp when the circuit breaker auto-resets. */
  circuitOpenUntil: Date | null;
}
