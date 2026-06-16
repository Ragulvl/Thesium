// server/services/metrics.ts

interface MetricStore {
  requests: {
    total: number;
    errors: number;
    latencies: number[]; // Store last N latencies to compute avg
  };
  database: {
    slowQueries: number;
  };
  queue: {
    waitTimes: number[];
    processingTimes: number[];
  };
}

class MetricsTracker {
  private store: MetricStore;
  private readonly MAX_SAMPLES = 1000; // Rolling window size

  constructor() {
    this.store = {
      requests: { total: 0, errors: 0, latencies: [] },
      database: { slowQueries: 0 },
      queue: { waitTimes: [], processingTimes: [] }
    };
  }

  // --- Requests ---
  recordRequest(latencyMs: number, isError: boolean) {
    this.store.requests.total++;
    if (isError) this.store.requests.errors++;
    
    this.store.requests.latencies.push(latencyMs);
    if (this.store.requests.latencies.length > this.MAX_SAMPLES) {
      this.store.requests.latencies.shift();
    }
  }

  // --- Database ---
  recordSlowQuery() {
    this.store.database.slowQueries++;
  }

  // --- Queue ---
  recordQueueWait(waitTimeMs: number) {
    this.store.queue.waitTimes.push(waitTimeMs);
    if (this.store.queue.waitTimes.length > this.MAX_SAMPLES) {
      this.store.queue.waitTimes.shift();
    }
  }

  recordQueueProcessing(processingTimeMs: number) {
    this.store.queue.processingTimes.push(processingTimeMs);
    if (this.store.queue.processingTimes.length > this.MAX_SAMPLES) {
      this.store.queue.processingTimes.shift();
    }
  }

  // --- Getters & Calculations ---
  getMetrics() {
    const calcAvg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    return {
      requests: {
        total: this.store.requests.total,
        errors: this.store.requests.total > 0 ? ((this.store.requests.errors / this.store.requests.total) * 100).toFixed(2) + '%' : '0%',
        avgLatencyMs: calcAvg(this.store.requests.latencies),
      },
      database: {
        slowQueries: this.store.database.slowQueries
      },
      queue: {
        avgWaitTimeMs: calcAvg(this.store.queue.waitTimes),
        avgProcessingTimeMs: calcAvg(this.store.queue.processingTimes),
      }
    };
  }
}

// Export singleton
export const metrics = new MetricsTracker();
