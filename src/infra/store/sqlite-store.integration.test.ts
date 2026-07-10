import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { SqliteAuthStore } from "../auth/sqlite-auth-store.js";
import { hashSessionToken } from "../../auth/session.js";
import { SqliteStore } from "./sqlite-store.js";

test("sqlite store persists project data across instances", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-sqlite-store-"));
  const dbPath = path.join(tempDir, "app.db");
  let firstStore: SqliteStore | undefined;
  let secondStore: SqliteStore | undefined;

  try {
    firstStore = new SqliteStore(dbPath);
    const project = await firstStore.createProject({
      name: "Persisted Project",
      createdBy: "user-1"
    });
    assert.ok(project.id);

    secondStore = new SqliteStore(dbPath);
    const projects = await secondStore.listProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.name, "Persisted Project");
  } finally {
    firstStore?.close();
    secondStore?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sqlite auth store persists users and sessions across instances", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-sqlite-auth-"));
  const dbPath = path.join(tempDir, "app.db");
  let authStoreA: SqliteAuthStore | undefined;
  let authStoreB: SqliteAuthStore | undefined;

  try {
    authStoreA = new SqliteAuthStore(dbPath);
    const user = await authStoreA.createUser({
      username: "persist-user",
      email: "persist@example.com",
      passwordHash: "hashed-pass",
      role: "owner",
      accountRole: "regular"
    });
    assert.equal(user.id, "persist-user");
    const tokenHash = hashSessionToken("abc-token");
    await authStoreA.createSession({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    authStoreB = new SqliteAuthStore(dbPath);
    const persistedUser = await authStoreB.getUserByEmail("persist@example.com");
    assert.ok(persistedUser);
    const persistedSession = await authStoreB.getSessionByTokenHash(tokenHash);
    assert.ok(persistedSession);
    assert.equal(persistedSession?.userId, user.id);
  } finally {
    authStoreA?.close();
    authStoreB?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
