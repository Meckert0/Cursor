import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthReport } from "./health.js";
import { MetricsRegistry } from "./metrics.js";
import { resolveCorrelationId, resolveRequestId } from "./request-ids.js";
import { MemoryLockManager } from "../locks/memory-lock-manager.js";
import { FileArtifactStorage } from "../storage/file-artifact-storage.js";
import { MemoryStore } from "../store/memory-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage } from "node:http";

test("MetricsRegistry tracks validation, export, and lock signals", () => {
  const metrics = new MetricsRegistry();
  metrics.recordValidationLatency(12.5, true);
  metrics.recordValidationLatency(7.5, false);
  metrics.recordExportEnqueued();
  metrics.recordExportCompleted();
  metrics.recordExportFailed();
  metrics.recordExportRetried();
  metrics.recordLockAcquired();
  metrics.recordLockContention();

  assert.deepEqual(metrics.snapshot(), {
    validation: {
      count: 2,
      errorCount: 1,
      totalLatencyMs: 20,
      avgLatencyMs: 10
    },
    exports: {
      enqueued: 1,
      completed: 1,
      failed: 1,
      retried: 1
    },
    locks: {
      acquired: 1,
      contention: 1
    }
  });
});

test("resolveRequestId and resolveCorrelationId honor inbound headers", () => {
  const req = {
    headers: {
      "x-request-id": "req-123",
      "x-correlation-id": "corr-456"
    }
  } as unknown as IncomingMessage;

  assert.equal(resolveRequestId(req), "req-123");
  assert.equal(resolveCorrelationId(req, "req-123"), "corr-456");
  assert.equal(resolveCorrelationId({ headers: {} } as unknown as IncomingMessage, "req-123"), "req-123");
});

test("buildHealthReport reports store, lock, and artifact backends", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-health-"));
  try {
    const report = await buildHealthReport({
      store: new MemoryStore(),
      lockManager: new MemoryLockManager(),
      artifactStorage: new FileArtifactStorage(tempDir)
    });
    assert.equal(report.ok, true);
    assert.equal(report.checks.store.backend, "memory");
    assert.equal(report.checks.lockManager.backend, "memory");
    assert.equal(report.checks.artifactBackend.backend, "file");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
