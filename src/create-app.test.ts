import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp, getApp } from "./create-app.js";
import { hashPassword } from "./auth/session.js";
import { MemoryStore } from "./infra/store/memory-store.js";

async function withMemoryRuntime(run: () => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cdt-startup-"));
  const values = {
    VERCEL: "0", STORE_BACKEND: "memory", ARTIFACT_STORAGE_BACKEND: "file",
    ARTIFACTS_DIR: directory, REDIS_URL: "", LOG_LEVEL: "silent", ENABLE_LEGACY_HEADER_AUTH: "false"
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const previousKeys = new Set(Object.keys(process.env));
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!previousKeys.has(key)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

test("catalog schema failures do not prevent API startup or password login", async (context) => {
  await withMemoryRuntime(async () => {
    let attempts = 0;
    context.mock.method(MemoryStore.prototype, "listLibraryComponents", async () => {
      attempts += 1;
      throw Object.assign(new Error('column "min_inclusive" does not exist'), { code: "42703" });
    });
    const warnings = context.mock.method(console, "warn", () => {});
    const created = await createApp({ runLocalStartupTasks: false });
    try {
      assert.equal(attempts, 2, "Both catalogs are attempted independently");
      assert.ok(warnings.mock.calls.some((call) => String(call.arguments[0]).includes("catalog")));
      await created.authStore.createUser({
        username: "login-regression", email: "login@example.com", passwordHash: await hashPassword("test-password-123"),
        role: "owner", accountRole: "regular"
      });
      const response = await created.app.inject({
        method: "POST", url: "/v1/auth/login", payload: { email: "login@example.com", password: "test-password-123" }
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().user.id, "login-regression");
      assert.ok(response.json().sessionToken);
    } finally {
      await created.close();
    }
  });
});

test("a failed shared API initialization is retried on the next request", async () => {
  await withMemoryRuntime(async () => {
    process.env.VERCEL = "1";
    process.env.STORE_BACKEND = "sqlite";
    const failed = getApp({ runLocalStartupTasks: false });
    assert.equal(getApp(), failed, "Concurrent requests share initialization");
    await assert.rejects(failed, /STORE_BACKEND=postgres/);

    process.env.VERCEL = "0";
    process.env.STORE_BACKEND = "memory";
    const retry = getApp({ runLocalStartupTasks: false });
    assert.notEqual(retry, failed);
    const created = await retry;
    try {
      assert.equal(getApp(), retry);
      const response = await created.app.inject({
        method: "POST", url: "/v1/auth/login", payload: { email: "missing@example.com", password: "test-password-123" }
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await created.close();
    }
  });
});
