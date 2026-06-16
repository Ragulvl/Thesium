// AI Provider Health Monitor — Circuit Breaker + Rolling Stats
//
// In-memory for Phase 1 (worker concurrency = 1).
// Future: migrate to Redis for multi-worker deployments.

import type { ProviderName, ProviderHealth } from './types.js';

// ── Configuration ────────────────────────────────────────────────────

/** Number of consecutive failures before opening the circuit breaker. */
const CIRCUIT_BREAKER_THRESHOLD = 3;

/** How long (ms) to keep the circuit open before retrying the provider. */
const CIRCUIT_COOLDOWN_MS = 60_000;

/** Max latency samples to keep for rolling average. */
const MAX_LATENCY_SAMPLES = 100;

// ── Health Monitor ───────────────────────────────────────────────────

class HealthMonitor {
  private healthMap = new Map<ProviderName, ProviderHealth>();
  private latencySamples = new Map<ProviderName, number[]>();

  private getOrCreate(provider: ProviderName): ProviderHealth {
    let h = this.healthMap.get(provider);
    if (!h) {
      h = {
        provider,
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        avgLatencyMs: 0,
        lastFailure: null,
        lastSuccess: null,
        circuitOpen: false,
        circuitOpenUntil: null,
      };
      this.healthMap.set(provider, h);
      this.latencySamples.set(provider, []);
    }
    return h;
  }

  /** Record a successful call. Resets consecutive failures and closes circuit. */
  recordSuccess(provider: ProviderName, latencyMs: number): void {
    const h = this.getOrCreate(provider);
    h.totalRequests++;
    h.successCount++;
    h.consecutiveFailures = 0;
    h.lastSuccess = new Date();

    // Close circuit on success (half-open → closed)
    if (h.circuitOpen) {
      h.circuitOpen = false;
      h.circuitOpenUntil = null;
    }

    // Rolling latency
    const samples = this.latencySamples.get(provider)!;
    samples.push(latencyMs);
    if (samples.length > MAX_LATENCY_SAMPLES) samples.shift();
    h.avgLatencyMs = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  }

  /** Record a failed call. Opens circuit breaker after threshold. */
  recordFailure(provider: ProviderName, _error?: unknown): void {
    const h = this.getOrCreate(provider);
    h.totalRequests++;
    h.failureCount++;
    h.consecutiveFailures++;
    h.lastFailure = new Date();

    if (h.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !h.circuitOpen) {
      h.circuitOpen = true;
      h.circuitOpenUntil = new Date(Date.now() + CIRCUIT_COOLDOWN_MS);
    }
  }

  /** Check if a provider is healthy (circuit closed or cooldown expired). */
  isHealthy(provider: ProviderName): boolean {
    const h = this.healthMap.get(provider);
    if (!h) return true; // No data = assume healthy

    if (!h.circuitOpen) return true;

    // Check if cooldown has expired → allow a probe request (half-open)
    if (h.circuitOpenUntil && Date.now() > h.circuitOpenUntil.getTime()) {
      return true;
    }

    return false;
  }

  /** Get health stats for a single provider. */
  getHealth(provider: ProviderName): ProviderHealth {
    return this.getOrCreate(provider);
  }

  /** Get health stats for all tracked providers. */
  getAllHealth(): ProviderHealth[] {
    // Ensure all three providers have entries
    for (const p of ['gemini', 'groq', 'openrouter'] as ProviderName[]) {
      this.getOrCreate(p);
    }
    return Array.from(this.healthMap.values());
  }

  /** Get success rate for a provider on a specific stage (future: per-stage tracking). */
  getSuccessRate(provider: ProviderName): number {
    const h = this.healthMap.get(provider);
    if (!h || h.totalRequests === 0) return 1.0;
    return h.successCount / h.totalRequests;
  }
}

// ── Singleton ────────────────────────────────────────────────────────

export const healthMonitor = new HealthMonitor();
