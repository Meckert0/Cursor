import { Redis } from "ioredis";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { buildApp } from "./app.js";
import { loadDotEnv } from "./infra/env/load-dotenv.js";
import {
  assertHostedConfig,
  isHostedRuntime,
  resolveArtifactStorageBackend,
  resolveStoreBackend
} from "./infra/env/hosted-config.js";
import { RedisExportJobLock } from "./infra/locks/export-job-lock.js";
import type { LockManager } from "./infra/locks/lock-manager.js";
import { MemoryLockManager } from "./infra/locks/memory-lock-manager.js";
import { RedisLockManager } from "./infra/locks/redis-lock-manager.js";
import { metricsRegistry } from "./infra/observability/metrics.js";
import {
  BlobDownloadUrlResolver,
  PassthroughArtifactDownloadUrlResolver,
  S3PresigningArtifactDownloadUrlResolver,
  type ArtifactDownloadUrlResolver
} from "./infra/storage/artifact-download-url-resolver.js";
import type { ArtifactStorage } from "./infra/storage/artifact-storage.js";
import { BlobArtifactStorage } from "./infra/storage/blob-artifact-storage.js";
import { FileArtifactStorage } from "./infra/storage/file-artifact-storage.js";
import { S3ArtifactStorage } from "./infra/storage/s3-artifact-storage.js";
import type { AuthStore } from "./infra/auth/auth-store.js";
import { MemoryAuthStore } from "./infra/auth/memory-auth-store.js";
import { PostgresAuthStore } from "./infra/auth/postgres-auth-store.js";
import { MemoryStore } from "./infra/store/memory-store.js";
import { PostgresStore } from "./infra/store/postgres-store.js";
import type { Store } from "./infra/store/store.js";
import { ExportQueueService } from "./services/export-queue.js";
import { runMaintenance } from "./services/maintenance.js";
import type { FastifyInstance } from "fastify";

export type ScheduleBackground = (start: () => Promise<void>) => void;

export interface CreateAppOptions {
  scheduleBackground?: ScheduleBackground;
  runLocalStartupTasks?: boolean;
}

export interface CreatedApp {
  app: FastifyInstance;
  store: Store;
  authStore: AuthStore;
  exportQueue: ExportQueueService;
  pgPool?: Pool;
  redis?: Redis;
  close: () => Promise<void>;
}

let appPromise: Promise<CreatedApp> | undefined;

export function getApp(options?: CreateAppOptions): Promise<CreatedApp> {
  if (!appPromise) {
    appPromise = createApp(options);
  }
  return appPromise;
}

export async function createApp(options: CreateAppOptions = {}): Promise<CreatedApp> {
  loadDotEnv();
  assertHostedConfig();

  const hosted = isHostedRuntime();
  const storeBackend = resolveStoreBackend();
  let store: Store = new MemoryStore();
  let authStore: AuthStore = new MemoryAuthStore();
  let pgPool: Pool | undefined;
  const redisUrl = process.env.REDIS_URL;
  const redisKeyPrefix = process.env.REDIS_KEY_PREFIX ?? "";

  let lockManager: LockManager = new MemoryLockManager();
  let redis: Redis | undefined;

  if (storeBackend === "postgres") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required when STORE_BACKEND=postgres");
    }
    pgPool = new Pool({
      connectionString: databaseUrl,
      max: hosted ? 1 : 10,
      idleTimeoutMillis: hosted ? 10_000 : 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: hosted
    });
    await pgPool.query("SELECT 1");
    store = new PostgresStore(pgPool);
    authStore = new PostgresAuthStore(pgPool);
    console.info(`Store backend: postgres (${databaseUrl.replace(/:[^:@/]+@/, ":***@")})`);
  } else if (storeBackend === "sqlite") {
    const sqlitePath = process.env.SQLITE_PATH
      ? path.resolve(process.env.SQLITE_PATH)
      : path.resolve(process.cwd(), "data", "app.db");
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    const { SqliteStore } = await import("./infra/store/sqlite-store.js");
    const { SqliteAuthStore } = await import("./infra/auth/sqlite-auth-store.js");
    store = new SqliteStore(sqlitePath);
    authStore = new SqliteAuthStore(sqlitePath);
    console.info(`Store backend: sqlite (${sqlitePath})`);
  } else if (storeBackend === "memory") {
    console.warn(
      "Store backend: memory — project, auth, and item-database data will NOT survive process restart. Use STORE_BACKEND=sqlite (default) or postgres for durable storage."
    );
  } else {
    throw new Error(`Unsupported STORE_BACKEND="${storeBackend}". Use sqlite, postgres, or memory.`);
  }

  if (redisUrl) {
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      keepAlive: 10_000,
      family: 0,
      retryStrategy(times) {
        return Math.min(times * 200, 2_000);
      },
      reconnectOnError() {
        return true;
      }
    });
    redis.on("error", (error) => {
      console.warn(`Redis error: ${error instanceof Error ? error.message : String(error)}`);
    });
    try {
      await redis.connect();
      await redis.ping();
      lockManager = new RedisLockManager(redis, redisKeyPrefix);
    } catch (error) {
      if (redis.status !== "end") {
        redis.disconnect();
      }
      redis = undefined;
      if (hosted) {
        throw new Error(
          `Redis is required on Vercel but connection failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      console.warn("REDIS_URL was set but Redis is unavailable; falling back to in-memory locks (local only).");
    }
  }

  const artifactStorageBackend = resolveArtifactStorageBackend();
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
  } else if (artifactStorageBackend === "blob") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required when ARTIFACT_STORAGE_BACKEND=blob");
    }
    artifactStorage = new BlobArtifactStorage({
      keyPrefix: process.env.BLOB_KEY_PREFIX,
      token
    });
    artifactDownloadUrlResolver = new BlobDownloadUrlResolver(undefined, token);
  } else if (artifactStorageBackend === "file") {
    const artifactsDirectory = process.env.ARTIFACTS_DIR
      ? path.resolve(process.env.ARTIFACTS_DIR)
      : path.resolve(process.cwd(), "artifacts");
    artifactStorage = new FileArtifactStorage(artifactsDirectory);
  } else {
    throw new Error(`Unsupported ARTIFACT_STORAGE_BACKEND="${artifactStorageBackend}". Use file, s3, or blob.`);
  }

  const runLocalStartupTasks = options.runLocalStartupTasks ?? !hosted;
  const exportQueue = new ExportQueueService(store, artifactStorage, {
    metrics: metricsRegistry,
    scheduleBackground: options.scheduleBackground,
    jobLock: redis ? new RedisExportJobLock(redis, redisKeyPrefix) : undefined,
    staleProcessingMs: runLocalStartupTasks ? 0 : undefined
  });

  const app = buildApp({
    store,
    authStore,
    lockManager,
    exportQueue,
    artifactDownloadUrlResolver,
    artifactStorage,
    metrics: metricsRegistry
  });
  await app.ready();

  if (runLocalStartupTasks) {
    const result = await runMaintenance({ exportQueue, authStore });
    if (result.recovery.recovered > 0 || result.due.processed > 0) {
      console.info(
        `Export queue recovery: requeued ${result.recovery.recovered} interrupted job(s), processed ${result.due.processed} queued job(s).`
      );
    }
    if (result.retention.deleted > 0) {
      console.info(`Export retention cleanup deleted ${result.retention.deleted} expired artifact(s).`);
    }
  }

  const close = async () => {
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
  };

  return { app, store, authStore, exportQueue, pgPool, redis, close };
}
