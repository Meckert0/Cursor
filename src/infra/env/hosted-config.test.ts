import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHostedConfig,
  isHostedRuntime,
  resolveArtifactStorageBackend,
  resolveDatabaseUrl,
  resolveStoreBackend
} from "./hosted-config.js";

test("local defaults remain sqlite and file storage", () => {
  const env = { STORE_BACKEND: undefined, ARTIFACT_STORAGE_BACKEND: undefined } as unknown as NodeJS.ProcessEnv;
  assert.equal(isHostedRuntime(env), false);
  assert.equal(resolveStoreBackend(env), "sqlite");
  assert.equal(resolveArtifactStorageBackend(env), "file");
});

test("Vercel defaults to postgres and s3", () => {
  const env = { VERCEL: "1" } as NodeJS.ProcessEnv;
  assert.equal(isHostedRuntime(env), true);
  assert.equal(resolveStoreBackend(env), "postgres");
  assert.equal(resolveArtifactStorageBackend(env), "s3");
});

test("assertHostedConfig is a no-op off Vercel", () => {
  assert.doesNotThrow(() => assertHostedConfig({}));
});

test("assertHostedConfig rejects local backends on Vercel", () => {
  assert.throws(
    () =>
      assertHostedConfig({
        VERCEL: "1",
        STORE_BACKEND: "sqlite",
        DATABASE_URL: "postgres://localhost/cdt",
        REDIS_URL: "redis://localhost",
        ARTIFACT_STORAGE_BACKEND: "s3",
        S3_BUCKET: "bucket"
      }),
    /STORE_BACKEND=postgres/
  );
  assert.throws(
    () =>
      assertHostedConfig({
        VERCEL: "1",
        STORE_BACKEND: "postgres",
        DATABASE_URL: "postgres://localhost/cdt",
        REDIS_URL: "redis://localhost",
        ARTIFACT_STORAGE_BACKEND: "file",
        S3_BUCKET: "bucket"
      }),
    /ARTIFACT_STORAGE_BACKEND=s3 or blob/
  );
});

test("resolveDatabaseUrl accepts Neon Marketplace aliases", () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "postgres://primary" }), "postgres://primary");
  assert.equal(resolveDatabaseUrl({ POSTGRES_URL: " postgres://neon " }), "postgres://neon");
  assert.equal(
    resolveDatabaseUrl({ POSTGRES_PRISMA_URL: "postgres://prisma" }),
    "postgres://prisma"
  );
  assert.equal(resolveDatabaseUrl({ POSTGRES_URL: "postgres://neon", DATABASE_URL: "" }), "postgres://neon");
  assert.equal(resolveDatabaseUrl({}), undefined);
});

test("assertHostedConfig accepts POSTGRES_URL when DATABASE_URL is unset", () => {
  assert.doesNotThrow(() =>
    assertHostedConfig({
      VERCEL: "1",
      POSTGRES_URL: "postgres://neon/cdt",
      REDIS_URL: "redis://localhost",
      S3_BUCKET: "cdt-artifacts"
    })
  );
});

test("assertHostedConfig requires postgres, redis, and s3 on Vercel", () => {
  assert.doesNotThrow(() =>
    assertHostedConfig({
      VERCEL: "1",
      DATABASE_URL: "postgres://localhost/cdt",
      REDIS_URL: "redis://localhost",
      S3_BUCKET: "cdt-artifacts"
    })
  );
  assert.throws(() => assertHostedConfig({ VERCEL: "1", REDIS_URL: "redis://localhost", S3_BUCKET: "b" }), /DATABASE_URL/);
  assert.throws(
    () => assertHostedConfig({ VERCEL: "1", DATABASE_URL: "postgres://localhost/cdt", S3_BUCKET: "b" }),
    /REDIS_URL/
  );
  assert.throws(
    () =>
      assertHostedConfig({
        VERCEL: "1",
        DATABASE_URL: "postgres://localhost/cdt",
        REDIS_URL: "redis://localhost"
      }),
    /S3_BUCKET/
  );
});

test("assertHostedConfig allows blob storage when BLOB_READ_WRITE_TOKEN is set", () => {
  assert.doesNotThrow(() =>
    assertHostedConfig({
      VERCEL: "1",
      DATABASE_URL: "postgres://localhost/cdt",
      REDIS_URL: "redis://localhost",
      ARTIFACT_STORAGE_BACKEND: "blob",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test"
    })
  );
  assert.throws(
    () =>
      assertHostedConfig({
        VERCEL: "1",
        DATABASE_URL: "postgres://localhost/cdt",
        REDIS_URL: "redis://localhost",
        ARTIFACT_STORAGE_BACKEND: "blob"
      }),
    /BLOB_READ_WRITE_TOKEN/
  );
});
