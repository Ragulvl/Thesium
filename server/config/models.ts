// Why: Centralize AI model strings — were hardcoded in ~10 places in pipeline.ts.

export const MODELS = {
  /** Fast — outlines, summaries, search queries, citations */
  FAST: process.env.MODEL_FAST || 'nvidia/nemotron-nano-9b-v2:free',
  /** Medium — review, grammar, verification */
  MEDIUM: process.env.MODEL_MEDIUM || 'nvidia/nemotron-3-nano-30b-a3b:free',
  /** Large — drafting, consistency review */
  LARGE: process.env.MODEL_LARGE || 'nvidia/nemotron-3-super-120b-a12b:free',
  /** Primary drafter */
  DRAFTER: process.env.MODEL_DRAFTER || 'stepfun/step-3.5-flash:free',
} as const;

/** Per-provider model selections — consumed by AI stage router. */
export const PROVIDER_MODELS = {
  gemini: {
    fast: 'gemini-2.0-flash',
    lite: 'gemini-2.0-flash-lite',
    pro:  'gemini-2.5-pro',
  },
  groq: {
    fast:      'llama-3.3-70b-versatile',
    lite:      'llama-3.1-8b-instant',
    reasoning: 'deepseek-r1-distill-llama-70b',
  },
} as const;

/** Per-LLM-call timeout in ms — free-tier models can take 60-90s */
export const LLM_CALL_TIMEOUT_MS = Number(process.env.LLM_CALL_TIMEOUT_MS) || 120_000;

/** Max estimated cost (USD) per pipeline job before aborting */
export const MAX_JOB_COST_USD = Number(process.env.MAX_JOB_COST_USD) || 0.50;
