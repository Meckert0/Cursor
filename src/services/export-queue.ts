import { randomUUID } from "node:crypto";
import { createLibraryLookup, type LibraryLookup } from "../domain/bom.js";
import { buildDeterministicDocumentExport, buildDeterministicJsonExport } from "../domain/exporter.js";
import type { ExportArtifact } from "../domain/types.js";
import type { ExportJobLock } from "../infra/locks/export-job-lock.js";
import type { MetricsRegistry } from "../infra/observability/metrics.js";
import type { ArtifactStorage } from "../infra/storage/artifact-storage.js";
import type { Store } from "../infra/store/store.js";

export type ExportFailureKind = "transient" | "permanent";

export type ExportLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export interface ExportQueueOptions {
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retentionDays?: number;
  staleProcessingMs?: number;
  sameRequestRetryBudgetMs?: number;
  now?: () => Date;
  scheduleBackground?: (start: () => Promise<void>) => void;
  jobLock?: ExportJobLock;
  logger?: ExportLogger;
  metrics?: MetricsRegistry;
}

type ExportTraceContext = {
  requestId: string;
  correlationId: string;
};

const PERMANENT_MESSAGE_PATTERNS = [
  /revision not found/i,
  /wirelist template file not found/i,
  /worksheet xml not found/i,
  /workbook xml not found/i,
  /workbook relationships xml not found/i,
  /content types xml not found/i
];

const TRANSIENT_CODE_PATTERNS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EPIPE",
  "SlowDown",
  "TimeoutError",
  "NetworkingError",
  "RequestTimeout",
  "ServiceUnavailable",
  "Throttling",
  "PriorRequestNotComplete"
];

const silentLogger: ExportLogger = {
  info() {},
  warn() {},
  error() {}
};

export function classifyExportError(error: unknown): ExportFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (PERMANENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "permanent";
  }

  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (TRANSIENT_CODE_PATTERNS.includes(code)) {
    return "transient";
  }
  if (/timeout|temporar|unavailable|econn|throttle|slow down|\b503\b|\b429\b|network/i.test(message)) {
    return "transient";
  }
  return "transient";
}

export function computeRetryDelayMs(attemptCount: number, baseDelayMs: number): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 8));
  return baseDelayMs * 2 ** (cappedAttempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class ExportQueueService {
  private readonly exportContext = new Map<string, ExportTraceContext>();
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retentionDays: number;
  private readonly staleProcessingMs: number;
  private readonly sameRequestRetryBudgetMs: number;
  private readonly now: () => Date;
  private readonly scheduleBackground: (start: () => Promise<void>) => void;
  private readonly jobLock?: ExportJobLock;
  private logger: ExportLogger;
  private readonly metrics?: MetricsRegistry;

  constructor(
    private readonly store: Store,
    private readonly artifactStorage: ArtifactStorage,
    options: ExportQueueOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? Number(process.env.EXPORT_MAX_ATTEMPTS ?? 3);
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? Number(process.env.EXPORT_RETRY_BASE_MS ?? 500);
    this.retentionDays = options.retentionDays ?? Number(process.env.EXPORT_ARTIFACT_RETENTION_DAYS ?? 30);
    this.staleProcessingMs =
      options.staleProcessingMs ?? Number(process.env.EXPORT_STALE_PROCESSING_MS ?? 300_000);
    this.sameRequestRetryBudgetMs =
      options.sameRequestRetryBudgetMs ?? Number(process.env.EXPORT_SAME_REQUEST_RETRY_BUDGET_MS ?? 10_000);
    this.now = options.now ?? (() => new Date());
    this.scheduleBackground = options.scheduleBackground ?? ((start) => {
      void start();
    });
    this.jobLock = options.jobLock;
    this.logger = options.logger ?? silentLogger;
    this.metrics = options.metrics;
  }

  setLogger(logger: ExportLogger): void {
    this.logger = logger;
  }

  async enqueueExport(input: {
    revisionId: string;
    format: ExportArtifact["format"];
    requestId?: string;
    correlationId?: string;
  }): Promise<ExportArtifact> {
    const exportArtifact = await this.store.createExportArtifact({
      revisionId: input.revisionId,
      format: input.format,
      status: "queued"
    });

    const requestId = input.requestId ?? randomUUID();
    const correlationId = input.correlationId ?? requestId;
    this.exportContext.set(exportArtifact.id, { requestId, correlationId });
    this.metrics?.recordExportEnqueued();
    this.logger.info(
      {
        exportId: exportArtifact.id,
        revisionId: input.revisionId,
        format: input.format,
        requestId,
        correlationId
      },
      "export.enqueued"
    );

    this.scheduleBackground(() =>
      this.processUntilDone(exportArtifact.id).catch((error) => {
        this.logger.error(
          {
            exportId: exportArtifact.id,
            errorMessage: error instanceof Error ? error.message : String(error)
          },
          "export.background.failed"
        );
      })
    );
    return exportArtifact;
  }

  async recoverOrphanedExports(): Promise<{ recovered: number }> {
    const processing = await this.store.listExportArtifactsByStatuses(["processing"]);
    const cutoffIso =
      this.staleProcessingMs > 0 ? new Date(this.now().getTime() - this.staleProcessingMs).toISOString() : null;
    let recovered = 0;

    for (const artifact of processing) {
      if (cutoffIso && artifact.updatedAt > cutoffIso) {
        continue;
      }
      await this.store.updateExportArtifact({
        exportId: artifact.id,
        status: "queued",
        errorMessage: "Recovered after interrupted processing.",
        failureKind: "transient",
        nextAttemptAt: null
      });
      recovered += 1;
    }

    return { recovered };
  }

  async processDueExports(): Promise<{ processed: number }> {
    const queued = await this.store.listExportArtifactsByStatuses(["queued"]);
    let processed = 0;
    for (const artifact of queued) {
      if (!this.isDue(artifact)) {
        continue;
      }
      await this.processUntilDone(artifact.id);
      processed += 1;
    }
    return { processed };
  }

  async processUntilDone(exportId: string): Promise<void> {
    while (true) {
      await this.processExport(exportId);
      const current = await this.store.getExportArtifact(exportId);
      if (!current || current.status !== "queued") {
        return;
      }
      const delayMs = this.delayUntilNextAttemptMs(current);
      if (delayMs > this.sameRequestRetryBudgetMs) {
        return;
      }
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  async runRetentionCleanup(): Promise<{ deleted: number }> {
    if (!Number.isFinite(this.retentionDays) || this.retentionDays <= 0) {
      return { deleted: 0 };
    }

    const cutoff = new Date(this.now().getTime() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const expired = await this.store.listExportArtifactsOlderThan({
      olderThanIso: cutoff,
      statuses: ["completed", "failed"]
    });

    let deleted = 0;
    for (const artifact of expired) {
      if (artifact.artifactUri) {
        try {
          await this.artifactStorage.deleteArtifact(artifact.artifactUri);
        } catch (error) {
          this.logger.warn(
            {
              exportId: artifact.id,
              artifactUri: artifact.artifactUri,
              errorMessage: error instanceof Error ? error.message : String(error)
            },
            "export.retention.file_delete_failed"
          );
          continue;
        }
      }
      const removed = await this.store.deleteExportArtifact(artifact.id);
      if (removed) {
        deleted += 1;
      }
    }
    return { deleted };
  }

  private isDue(artifact: ExportArtifact): boolean {
    return this.delayUntilNextAttemptMs(artifact) <= 0;
  }

  private delayUntilNextAttemptMs(artifact: ExportArtifact): number {
    const nextAttemptAtMs = artifact.nextAttemptAt ? Date.parse(artifact.nextAttemptAt) : NaN;
    if (!Number.isFinite(nextAttemptAtMs)) {
      return 0;
    }
    return Math.max(0, nextAttemptAtMs - this.now().getTime());
  }

  private async loadLibraryLookup(): Promise<LibraryLookup> {
    const [components, aliases] = await Promise.all([
      this.store.listLibraryComponents({
        requestingUserId: "system-export",
        canViewAllUnreviewed: true,
        canViewInactive: true
      }),
      this.store.listPartAliases()
    ]);
    return createLibraryLookup(components, aliases);
  }

  private resolveTraceContext(exportId: string): ExportTraceContext {
    const existing = this.exportContext.get(exportId);
    if (existing) {
      return existing;
    }
    const fallbackId = randomUUID();
    const context = { requestId: fallbackId, correlationId: fallbackId };
    this.exportContext.set(exportId, context);
    return context;
  }

  private jobLockTtlSeconds(): number {
    const fromStale = Math.ceil((this.staleProcessingMs || 60_000) / 1000);
    return Math.max(60, fromStale);
  }

  private async processExport(exportId: string): Promise<void> {
    const existing = await this.store.getExportArtifact(exportId);
    if (!existing || existing.status === "completed") {
      return;
    }
    if (existing.status === "processing") {
      return;
    }
    if (existing.status === "failed" && existing.failureKind === "permanent") {
      return;
    }
    if (!this.isDue(existing)) {
      return;
    }

    let lockHeld = false;
    if (this.jobLock) {
      lockHeld = await this.jobLock.acquire(exportId, this.jobLockTtlSeconds());
      if (!lockHeld) {
        return;
      }
    }

    try {
      const locked = await this.store.getExportArtifact(exportId);
      if (!locked || locked.status === "completed" || locked.status === "processing") {
        return;
      }
      if (locked.status === "failed" && locked.failureKind === "permanent") {
        return;
      }
      if (!this.isDue(locked)) {
        return;
      }

      const trace = this.resolveTraceContext(exportId);
      const attemptCount = (locked.attemptCount ?? 0) + 1;
      await this.store.updateExportArtifact({
        exportId,
        status: "processing",
        attemptCount,
        nextAttemptAt: null
      });

      const exportArtifact = await this.store.getExportArtifact(exportId);
      if (!exportArtifact) {
        return;
      }

      this.logger.info(
        {
          exportId,
          revisionId: exportArtifact.revisionId,
          format: exportArtifact.format,
          attemptCount,
          requestId: trace.requestId,
          correlationId: trace.correlationId
        },
        "export.attempt.start"
      );

      try {
        const revision = await this.store.getRevision(exportArtifact.revisionId);
        if (!revision) {
          throw new Error("Revision not found for export.");
        }

        const libraryLookup = await this.loadLibraryLookup();

        let contentHash: string;
        let content: string | Buffer;
        if (exportArtifact.format === "json") {
          const built = buildDeterministicJsonExport(revision, libraryLookup);
          contentHash = built.contentHash;
          content = JSON.stringify(built.artifact, null, 2);
        } else {
          const built = await buildDeterministicDocumentExport(revision, exportArtifact.format, libraryLookup);
          contentHash = built.contentHash;
          content = built.content;
        }

        const artifactUri = await this.artifactStorage.saveArtifact({
          exportId,
          format: exportArtifact.format,
          content
        });

        await this.store.updateExportArtifact({
          exportId,
          status: "completed",
          contentHash,
          artifactUri,
          errorMessage: null,
          failureKind: null,
          nextAttemptAt: null,
          attemptCount
        });
        this.metrics?.recordExportCompleted();
        this.logger.info(
          {
            exportId,
            revisionId: exportArtifact.revisionId,
            format: exportArtifact.format,
            attemptCount,
            contentHash,
            artifactUri,
            requestId: trace.requestId,
            correlationId: trace.correlationId
          },
          "export.attempt.completed"
        );
        this.exportContext.delete(exportId);
      } catch (error) {
        const failureKind = classifyExportError(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown export failure.";
        const canRetry = failureKind === "transient" && attemptCount < this.maxAttempts;

        if (canRetry) {
          const delayMs = computeRetryDelayMs(attemptCount, this.retryBaseDelayMs);
          const nextAttemptAt = new Date(this.now().getTime() + delayMs).toISOString();
          await this.store.updateExportArtifact({
            exportId,
            status: "queued",
            errorMessage,
            failureKind,
            attemptCount,
            nextAttemptAt
          });
          this.metrics?.recordExportRetried();
          this.logger.warn(
            {
              exportId,
              revisionId: exportArtifact.revisionId,
              format: exportArtifact.format,
              attemptCount,
              failureKind,
              errorMessage,
              nextAttemptAt,
              requestId: trace.requestId,
              correlationId: trace.correlationId
            },
            "export.attempt.retry"
          );
          return;
        }

        await this.store.updateExportArtifact({
          exportId,
          status: "failed",
          errorMessage,
          failureKind,
          attemptCount,
          nextAttemptAt: null
        });
        this.metrics?.recordExportFailed();
        this.logger.error(
          {
            exportId,
            revisionId: exportArtifact.revisionId,
            format: exportArtifact.format,
            attemptCount,
            failureKind,
            errorMessage,
            requestId: trace.requestId,
            correlationId: trace.correlationId
          },
          "export.attempt.failed"
        );
        this.exportContext.delete(exportId);
      }
    } finally {
      if (lockHeld && this.jobLock) {
        await this.jobLock.release(exportId);
      }
    }
  }
}
