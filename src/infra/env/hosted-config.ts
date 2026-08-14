export function isHostedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL === "1";
}

export function resolveStoreBackend(env: NodeJS.ProcessEnv = process.env): string {
  const fallback = isHostedRuntime(env) ? "postgres" : "sqlite";
  return (env.STORE_BACKEND ?? fallback).toLowerCase();
}

export function resolveArtifactStorageBackend(env: NodeJS.ProcessEnv = process.env): string {
  const fallback = isHostedRuntime(env) ? "s3" : "file";
  return (env.ARTIFACT_STORAGE_BACKEND ?? fallback).toLowerCase();
}

export function assertHostedConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (!isHostedRuntime(env)) {
    return;
  }

  const storeBackend = resolveStoreBackend(env);
  if (storeBackend !== "postgres") {
    throw new Error(
      `Hosted deployments require STORE_BACKEND=postgres (received "${storeBackend}"). SQLite and memory stores are local-only.`
    );
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required on Vercel.");
  }
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required on Vercel so locks are shared across function instances.");
  }

  const artifactBackend = resolveArtifactStorageBackend(env);
  if (artifactBackend !== "s3" && artifactBackend !== "blob") {
    throw new Error(
      `Hosted deployments require ARTIFACT_STORAGE_BACKEND=s3 or blob (received "${artifactBackend}"). Local file storage is not durable on Vercel.`
    );
  }
  if (artifactBackend === "s3" && !env.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when ARTIFACT_STORAGE_BACKEND=s3.");
  }
  if (artifactBackend === "blob" && !env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required when ARTIFACT_STORAGE_BACKEND=blob.");
  }
}
