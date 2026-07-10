import { Redis } from "ioredis";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { buildApp } from "./app.js";
import type { LockManager } from "./infra/locks/lock-manager.js";
import { MemoryLockManager } from "./infra/locks/memory-lock-manager.js";
import { RedisLockManager } from "./infra/locks/redis-lock-manager.js";
import {
  PassthroughArtifactDownloadUrlResolver,
  S3PresigningArtifactDownloadUrlResolver,
  type ArtifactDownloadUrlResolver
} from "./infra/storage/artifact-download-url-resolver.js";
import type { ArtifactStorage } from "./infra/storage/artifact-storage.js";
import { FileArtifactStorage } from "./infra/storage/file-artifact-storage.js";
import { S3ArtifactStorage } from "./infra/storage/s3-artifact-storage.js";
import type { AuthStore } from "./infra/auth/auth-store.js";
import { MemoryAuthStore } from "./infra/auth/memory-auth-store.js";
import { PostgresAuthStore } from "./infra/auth/postgres-auth-store.js";
import { SqliteAuthStore } from "./infra/auth/sqlite-auth-store.js";
import { MemoryStore } from "./infra/store/memory-store.js";
import { PostgresStore } from "./infra/store/postgres-store.js";
import { SqliteStore } from "./infra/store/sqlite-store.js";
import type { Store } from "./infra/store/store.js";
import { ExportQueueService } from "./services/export-queue.js";

async function main() {
  const storeBackend = process.env.STORE_BACKEND ?? "memory";
  let store: Store = new MemoryStore();
  let authStore: AuthStore = new MemoryAuthStore();
  let pgPool: Pool | undefined;
  const redisUrl = process.env.REDIS_URL;

  let lockManager: LockManager = new MemoryLockManager();
  let redis: Redis | undefined;

  if (storeBackend === "postgres") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required when STORE_BACKEND=postgres");
    }
    pgPool = new Pool({ connectionString: databaseUrl });
    await pgPool.query("SELECT 1");
    store = new PostgresStore(pgPool);
    const postgresAuthStore = new PostgresAuthStore(pgPool);
    await postgresAuthStore.syncAdminRolesFromEnv();
    authStore = postgresAuthStore;
  } else if (storeBackend === "sqlite") {
    const sqlitePath = process.env.SQLITE_PATH
      ? path.resolve(process.env.SQLITE_PATH)
      : path.resolve(process.cwd(), "data", "app.db");
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    store = new SqliteStore(sqlitePath);
    authStore = new SqliteAuthStore(sqlitePath);
  }

  if (redisUrl) {
    redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    try {
      await redis.connect();
      await redis.ping();
      lockManager = new RedisLockManager(redis);
    } catch {
      if (redis.status !== "end") {
        redis.disconnect();
      }
    }
  }

  const artifactStorageBackend = process.env.ARTIFACT_STORAGE_BACKEND ?? "file";
  let artifactStorage: ArtifactStorage;
  let artifactDownloadUrlResolver: ArtifactDownloadUrlResolver = new PassthroughArtifactDownloadUrlResolver();
  if (artifactStorageBackend === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error("S3_BUCKET is required when ARTIFACT_STORAGE_BACKEND=s3");
    }
    const region = process.env.S3_REGION ?? "us-east-1";
    const endpoint = process.env.S3_ENDPOINT;
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    const s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey
            }
          : undefined
    });

    artifactStorage = new S3ArtifactStorage(s3Client, {
      bucket,
      keyPrefix: process.env.S3_KEY_PREFIX,
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL
    });

    const enableSignedDownloads = process.env.S3_SIGNED_DOWNLOADS === "true";
    if (enableSignedDownloads) {
      const ttlSeconds = Number(process.env.S3_SIGNED_DOWNLOAD_TTL_SECONDS ?? 900);
      artifactDownloadUrlResolver = new S3PresigningArtifactDownloadUrlResolver(s3Client, ttlSeconds);
    }
  } else {
    const artifactsDirectory = process.env.ARTIFACTS_DIR
      ? path.resolve(process.env.ARTIFACTS_DIR)
      : path.resolve(process.cwd(), "artifacts");
    artifactStorage = new FileArtifactStorage(artifactsDirectory);
  }

  const exportQueue = new ExportQueueService(store, artifactStorage);
  const recovery = await exportQueue.recoverOrphanedExports();
  if (recovery.recovered > 0 || recovery.scheduled > 0) {
    console.info(
      `Export queue recovery: requeued ${recovery.recovered} interrupted job(s), scheduled ${recovery.scheduled} queued job(s).`
    );
  }
  const retention = await exportQueue.runRetentionCleanup();
  if (retention.deleted > 0) {
    console.info(`Export retention cleanup deleted ${retention.deleted} expired artifact(s).`);
  }

  const app = buildApp({ store, authStore, lockManager, exportQueue, artifactDownloadUrlResolver });
  const port = Number(process.env.PORT ?? 3000);
  const host = "0.0.0.0";

  process.on("SIGINT", async () => {
    if (pgPool) {
      await pgPool.end();
    }
    if (redis && redis.status !== "end") {
      redis.disconnect();
    }
    if ("close" in store && typeof store.close === "function") {
      store.close();
    }
    if ("close" in authStore && typeof authStore.close === "function") {
      authStore.close();
    }
    await app.close();
    process.exit(0);
  });

  await app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
