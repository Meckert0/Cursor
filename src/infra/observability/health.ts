import type { ArtifactStorage } from "../storage/artifact-storage.js";
import type { LockManager } from "../locks/lock-manager.js";
import type { Store } from "../store/store.js";
import type { ComponentHealth, HealthReport } from "./metrics.js";

async function checkStore(store: Store): Promise<ComponentHealth> {
  try {
    await store.listProjects();
    const backend =
      store.constructor?.name === "PostgresStore"
        ? "postgres"
        : store.constructor?.name === "SqliteStore"
          ? "sqlite"
          : store.constructor?.name === "MemoryStore"
            ? "memory"
            : "unknown";
    return { ok: true, backend };
  } catch (error) {
    return {
      ok: false,
      backend: "unknown",
      detail: error instanceof Error ? error.message : "Store health check failed."
    };
  }
}

async function checkLockManager(lockManager: LockManager): Promise<ComponentHealth> {
  if (typeof lockManager.healthCheck === "function") {
    return lockManager.healthCheck();
  }
  return { ok: true, backend: "unknown", detail: "No healthCheck implemented." };
}

async function checkArtifactBackend(artifactStorage: ArtifactStorage): Promise<ComponentHealth> {
  if (typeof artifactStorage.healthCheck === "function") {
    return artifactStorage.healthCheck();
  }
  return { ok: true, backend: "unknown", detail: "No healthCheck implemented." };
}

export async function buildHealthReport(input: {
  store: Store;
  lockManager: LockManager;
  artifactStorage: ArtifactStorage;
  service?: string;
}): Promise<HealthReport> {
  const [store, lockManager, artifactBackend] = await Promise.all([
    checkStore(input.store),
    checkLockManager(input.lockManager),
    checkArtifactBackend(input.artifactStorage)
  ]);

  return {
    ok: store.ok && lockManager.ok && artifactBackend.ok,
    service: input.service ?? "cdt-api",
    now: new Date().toISOString(),
    checks: {
      store,
      lockManager,
      artifactBackend
    }
  };
}
