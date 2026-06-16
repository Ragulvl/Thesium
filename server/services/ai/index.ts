// AI Orchestration Layer — Barrel Exports
//
// Usage:  import { aiRouter } from './ai/index.js';
//         const res = await aiRouter.generate({ stage: 'draft', systemPrompt, userPrompt }, logger);

export { aiRouter } from './AIRouter.js';
export { healthMonitor } from './healthMonitor.js';
export { getRoutesForStage } from './stageRouter.js';
export type {
  AIRequest,
  AIResponse,
  AIProvider,
  PipelineStage,
  ProviderName,
  ProviderHealth,
  StageRouteEntry,
} from './types.js';
