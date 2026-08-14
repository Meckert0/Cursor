import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileArtifactStorage } from "../infra/storage/file-artifact-storage.js";
import { MemoryStore } from "../infra/store/memory-store.js";
import { classifyExportError, computeRetryDelayMs, ExportQueueService } from "./export-queue.js";

test("classifyExportError marks missing revision as permanent", () => {
  assert.equal(classifyExportError(new Error("Revision not found for export.")), "permanent");
});

test("classifyExportError marks network failures as transient", () => {
  const error = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  assert.equal(classifyExportError(error), "transient");
});

test("computeRetryDelayMs uses exponential backoff", () => {
  assert.equal(computeRetryDelayMs(1, 500), 500);
  assert.equal(computeRetryDelayMs(2, 500), 1000);
  assert.equal(computeRetryDelayMs(3, 500), 2000);
});

async function seedRevision(store: MemoryStore) {
  const project = await store.createProject({ name: "Export Project", createdBy: "user-a" });
  await store.upsertProjectMember({ projectId: project.id, userId: "user-a", role: "owner" });
  const design = await store.createDesign({
    projectId: project.id,
    name: "Export Design",
    createdBy: "user-a"
  });
  return store.createRevision({
    designId: design.id,
    createdBy: "user-a",
    rulesetVersion: "rules-2026.03",
    libraryVersion: "lib-2026.03.1",
    snapshot: {
      connectors: [
        { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
        { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
      ],
      paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire", length: 10 }],
      pinMappings: [],
      bundles: [],
      annotations: []
    }
  });
}

test("export queue recovers stale processing jobs then completes them", async () => {
  const store = new MemoryStore();
  const revision = await seedRevision(store);
  const artifact = await store.createExportArtifact({
    revisionId: revision.id,
    format: "json",
    status: "processing"
  });
  const state = store.exportState();
  const target = state.exports.find((item) => item.id === artifact.id);
  assert.ok(target);
  target.updatedAt = new Date("2020-01-01T00:00:00.000Z").toISOString();
  const restored = MemoryStore.fromState(state);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-export-"));
  try {
    const queue = new ExportQueueService(restored, new FileArtifactStorage(tempDir), {
      maxAttempts: 3,
      retryBaseDelayMs: 1,
      retentionDays: 0,
      staleProcessingMs: 60_000,
      scheduleBackground: () => {},
      now: () => new Date("2026-07-10T00:00:00.000Z")
    });
    const recovery = await queue.recoverOrphanedExports();
    assert.equal(recovery.recovered, 1);
    const due = await queue.processDueExports();
    assert.equal(due.processed, 1);

    const completed = await restored.getExportArtifact(artifact.id);
    assert.equal(completed?.status, "completed");
    assert.ok(completed?.contentHash);
    assert.ok(completed?.artifactUri);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("export queue does not recover fresh processing jobs", async () => {
  const store = new MemoryStore();
  const revision = await seedRevision(store);
  await store.createExportArtifact({
    revisionId: revision.id,
    format: "json",
    status: "processing"
  });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-export-"));
  try {
    const queue = new ExportQueueService(store, new FileArtifactStorage(tempDir), {
      staleProcessingMs: 300_000,
      scheduleBackground: () => {},
      now: () => new Date()
    });
    const recovery = await queue.recoverOrphanedExports();
    assert.equal(recovery.recovered, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("export queue retries transient failures then completes", async () => {
  const store = new MemoryStore();
  const revision = await seedRevision(store);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-export-"));
  let saveAttempts = 0;
  let currentTime = new Date("2026-07-10T00:00:00.000Z");

  class FlakyStorage extends FileArtifactStorage {
    override async saveArtifact(input: {
      exportId: string;
      format: "json" | "pdf" | "xlsx";
      content: string | Buffer;
    }): Promise<string> {
      saveAttempts += 1;
      if (saveAttempts === 1) {
        throw Object.assign(new Error("temporary network failure"), { code: "ECONNRESET" });
      }
      return super.saveArtifact(input);
    }
  }

  try {
    const queue = new ExportQueueService(store, new FlakyStorage(tempDir), {
      maxAttempts: 3,
      retryBaseDelayMs: 60_000,
      retentionDays: 0,
      sameRequestRetryBudgetMs: 0,
      scheduleBackground: () => {},
      now: () => currentTime
    });

    const artifact = await queue.enqueueExport({ revisionId: revision.id, format: "json" });
    await queue.processUntilDone(artifact.id);

    const afterFailure = await store.getExportArtifact(artifact.id);
    assert.equal(afterFailure?.status, "queued");
    assert.equal(afterFailure?.failureKind, "transient");
    assert.equal(afterFailure?.attemptCount, 1);
    assert.ok(afterFailure?.nextAttemptAt);

    currentTime = new Date("2026-07-10T00:01:00.000Z");
    await queue.processUntilDone(artifact.id);

    const completed = await store.getExportArtifact(artifact.id);
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.attemptCount, 2);
    assert.equal(saveAttempts, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("export queue marks permanent failures without retry", async () => {
  const store = new MemoryStore();
  const revision = await seedRevision(store);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-export-"));

  class PermanentFailStorage extends FileArtifactStorage {
    override async saveArtifact(): Promise<string> {
      throw new Error("Wirelist template file not found.");
    }
  }

  try {
    const queue = new ExportQueueService(store, new PermanentFailStorage(tempDir), {
      maxAttempts: 3,
      retryBaseDelayMs: 1,
      retentionDays: 0,
      scheduleBackground: () => {}
    });
    const artifact = await queue.enqueueExport({ revisionId: revision.id, format: "json" });
    await queue.processUntilDone(artifact.id);
    const failed = await store.getExportArtifact(artifact.id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.failureKind, "permanent");
    assert.equal(failed?.attemptCount, 1);
    assert.equal(failed?.nextAttemptAt, undefined);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("export retention cleanup deletes expired artifacts and files", async () => {
  const store = new MemoryStore();
  const revision = await seedRevision(store);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-export-"));
  const storage = new FileArtifactStorage(tempDir);
  const exportsDir = path.join(tempDir, "exports");
  await mkdir(exportsDir, { recursive: true });

  const oldExport = await store.createExportArtifact({
    revisionId: revision.id,
    format: "json",
    status: "queued"
  });
  const filePath = path.join(exportsDir, `${oldExport.id}.json`);
  await writeFile(filePath, '{"ok":true}', "utf8");
  await store.updateExportArtifact({
    exportId: oldExport.id,
    status: "completed",
    contentHash: "abc",
    artifactUri: `file://${filePath.replaceAll("\\", "/")}`,
    errorMessage: null
  });

  const state = store.exportState();
  const target = state.exports.find((item) => item.id === oldExport.id);
  assert.ok(target);
  target.updatedAt = new Date("2020-01-01T00:00:00.000Z").toISOString();
  const restored = MemoryStore.fromState(state);

  const queue = new ExportQueueService(restored, storage, {
    retentionDays: 30,
    now: () => new Date("2026-07-10T00:00:00.000Z")
  });
  const result = await queue.runRetentionCleanup();
  assert.equal(result.deleted, 1);
  assert.equal(await restored.getExportArtifact(oldExport.id), null);
  await assert.rejects(() => readFile(filePath), /ENOENT/);
});
