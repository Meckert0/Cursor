export type ComponentHealth = {
  ok: boolean;
  backend?: string;
  detail?: string;
};

export type HealthReport = {
  ok: boolean;
  service: string;
  now: string;
  checks: {
    store: ComponentHealth;
    lockManager: ComponentHealth;
    artifactBackend: ComponentHealth;
  };
};

export type MetricsSnapshot = {
  validation: {
    count: number;
    errorCount: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
  };
  exports: {
    enqueued: number;
    completed: number;
    failed: number;
    retried: number;
  };
  locks: {
    acquired: number;
    contention: number;
  };
};

export class MetricsRegistry {
  private validationCount = 0;
  private validationErrorCount = 0;
  private validationTotalLatencyMs = 0;
  private exportsEnqueued = 0;
  private exportsCompleted = 0;
  private exportsFailed = 0;
  private exportsRetried = 0;
  private locksAcquired = 0;
  private locksContention = 0;

  recordValidationLatency(latencyMs: number, ok = true): void {
    this.validationCount += 1;
    this.validationTotalLatencyMs += Math.max(0, latencyMs);
    if (!ok) {
      this.validationErrorCount += 1;
    }
  }

  recordExportEnqueued(): void {
    this.exportsEnqueued += 1;
  }

  recordExportCompleted(): void {
    this.exportsCompleted += 1;
  }

  recordExportFailed(): void {
    this.exportsFailed += 1;
  }

  recordExportRetried(): void {
    this.exportsRetried += 1;
  }

  recordLockAcquired(): void {
    this.locksAcquired += 1;
  }

  recordLockContention(): void {
    this.locksContention += 1;
  }

  snapshot(): MetricsSnapshot {
    return {
      validation: {
        count: this.validationCount,
        errorCount: this.validationErrorCount,
        totalLatencyMs: this.validationTotalLatencyMs,
        avgLatencyMs:
          this.validationCount === 0 ? 0 : Number((this.validationTotalLatencyMs / this.validationCount).toFixed(3))
      },
      exports: {
        enqueued: this.exportsEnqueued,
        completed: this.exportsCompleted,
        failed: this.exportsFailed,
        retried: this.exportsRetried
      },
      locks: {
        acquired: this.locksAcquired,
        contention: this.locksContention
      }
    };
  }

  reset(): void {
    this.validationCount = 0;
    this.validationErrorCount = 0;
    this.validationTotalLatencyMs = 0;
    this.exportsEnqueued = 0;
    this.exportsCompleted = 0;
    this.exportsFailed = 0;
    this.exportsRetried = 0;
    this.locksAcquired = 0;
    this.locksContention = 0;
  }
}

export const metricsRegistry = new MetricsRegistry();
