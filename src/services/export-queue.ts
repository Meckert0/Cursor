import { buildDeterministicDocumentExport, buildDeterministicJsonExport } from "../domain/exporter.js";
import type { ExportArtifact } from "../domain/types.js";
import type { ArtifactStorage } from "../infra/storage/artifact-storage.js";
import type { Store } from "../infra/store/store.js";

export type ExportFailureKind = "transient" | "permanent";

export interface ExportQueueOptions {
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retentionDays?: number;
  now?: () => Date;
  scheduleDelayed?: (callback: () => void, delayMs: number) => void;
}

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

export class ExportQueueService {
  private running = false;
  private readonly pendingExportIds: string[] = [];
  private readonly scheduledExportIds = new Set<string>();
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retentionDays: number;
  private readonly now: () => Date;
  private readonly scheduleDelayed: (callback: () => void, delayMs: number) => void;

  constructor(
    private readonly store: Store,
    private readonly artifactStorage: ArtifactStorage,
    options: ExportQueueOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? Number(process.env.EXPORT_MAX_ATTEMPTS ?? 3);
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? Number(process.env.EXPORT_RETRY_BASE_MS ?? 500);
    this.retentionDays = options.retentionDays ?? Number(process.env.EXPORT_ARTIFACT_RETENTION_DAYS ?? 30);
    this.now = options.now ?? (() => new Date());
    this.scheduleDelayed =
      options.scheduleDelayed ??
      ((callback, delayMs) => {
        setTimeout(callback, delayMs);
      });
  }

  async enqueueExport(input: { revisionId: string; format: ExportArtifact["format"] }): Promise<ExportArtifact> {
    const exportArtifact = await this.store.createExportArtifact({
      revisionId: input.revisionId,
      format: input.format,
      status: "queued"
    });

    this.enqueueExisting(exportArtifact.id);
    return exportArtifact;
  }

  async recoverOrphanedExports(): Promise<{ recovered: number; scheduled: number }> {
    const processing = await this.store.listExportArtifactsByStatuses(["processing"]);
    for (const artifact of processing) {
      await this.store.updateExportArtifact({
        exportId: artifact.id,
        status: "queued",
        errorMessage: "Recovered after interrupted processing.",
        failureKind: "transient",
        nextAttemptAt: null
      });
    }

    const queued = await this.store.listExportArtifactsByStatuses(["queued"]);
    let scheduled = 0;
    for (const artifact of queued) {
      this.scheduleExport(artifact);
      scheduled += 1;
    }
    return { recovered: processing.length, scheduled };
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
        } catch {
          // Continue deleting DB rows even if object cleanup fails; next run can retry file cleanup.
        }
      }
      const removed = await this.store.deleteExportArtifact(artifact.id);
      if (removed) {
        deleted += 1;
      }
    }
    return { deleted };
  }

  private enqueueExisting(exportId: string) {
    if (!this.pendingExportIds.includes(exportId)) {
      this.pendingExportIds.push(exportId);
    }
    this.kickProcessor();
  }

  private scheduleExport(artifact: ExportArtifact) {
    const nextAttemptAtMs = artifact.nextAttemptAt ? Date.parse(artifact.nextAttemptAt) : NaN;
    const delayMs = Number.isFinite(nextAttemptAtMs) ? Math.max(0, nextAttemptAtMs - this.now().getTime()) : 0;
    if (delayMs <= 0) {
      this.enqueueExisting(artifact.id);
      return;
    }
    if (this.scheduledExportIds.has(artifact.id)) {
      return;
    }
    this.scheduledExportIds.add(artifact.id);
    this.scheduleDelayed(() => {
      this.scheduledExportIds.delete(artifact.id);
      this.enqueueExisting(artifact.id);
    }, delayMs);
  }

  private kickProcessor() {
    if (this.running) {
      return;
    }

    this.running = true;
    queueMicrotask(async () => {
      try {
        while (this.pendingExportIds.length > 0) {
          const exportId = this.pendingExportIds.shift();
          if (exportId) {
            await this.processExport(exportId);
          }
        }
      } finally {
        this.running = false;
        if (this.pendingExportIds.length > 0) {
          this.kickProcessor();
        }
      }
    });
  }

  private async loadLibraryComponents() {
    return this.store.listLibraryComponents({
      requestingUserId: "system-export",
      canViewAllUnreviewed: true,
      canViewInactive: true
    });
  }

  private async processExport(exportId: string): Promise<void> {
    const existing = await this.store.getExportArtifact(exportId);
    if (!existing || existing.status === "completed") {
      return;
    }
    if (existing.status === "failed" && existing.failureKind === "permanent") {
      return;
    }

    const attemptCount = (existing.attemptCount ?? 0) + 1;
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

    try {
      const revision = await this.store.getRevision(exportArtifact.revisionId);
      if (!revision) {
        throw new Error("Revision not found for export.");
      }

      const libraryComponents = await this.loadLibraryComponents();

      let contentHash: string;
      let content: string | Buffer;
      if (exportArtifact.format === "json") {
        const built = buildDeterministicJsonExport(revision, libraryComponents);
        contentHash = built.contentHash;
        content = JSON.stringify(built.artifact, null, 2);
      } else {
        const built = await buildDeterministicDocumentExport(revision, exportArtifact.format, libraryComponents);
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
    } catch (error) {
      const failureKind = classifyExportError(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown export failure.";
      const canRetry = failureKind === "transient" && attemptCount < this.maxAttempts;

      if (canRetry) {
        const delayMs = computeRetryDelayMs(attemptCount, this.retryBaseDelayMs);
        const nextAttemptAt = new Date(this.now().getTime() + delayMs).toISOString();
        const updated = await this.store.updateExportArtifact({
          exportId,
          status: "queued",
          errorMessage,
          failureKind,
          attemptCount,
          nextAttemptAt
        });
        if (updated) {
          this.scheduleExport(updated);
        }
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
    }
  }
}
