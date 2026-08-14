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

test("sqlite store persists library parts, aliases, and compat across instances", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-sqlite-parts-"));
  const dbPath = path.join(tempDir, "app.db");
  let firstStore: SqliteStore | undefined;
  let secondStore: SqliteStore | undefined;

  try {
    firstStore = new SqliteStore(dbPath);
    const ingest = await firstStore.ingestLibraryComponents({
      requestedByUserId: "user-1",
      dryRun: false,
      items: [
        {
          id: "cmp-contact-persist",
          category: "contact",
          family: "TP",
          partNumber: "CONTACT-PERSIST-1",
          description: "Persisted contact",
          isActive: true,
          isReviewed: false,
          stockStatus: "unknown",
          attributes: {
            gender: "ML",
            awg: "22",
            acceptedFamilies: []
          },
          aliases: [{ codeSystem: "contact_3digit", code: "101" }]
        },
        {
          id: "cmp-wire-persist",
          category: "wire",
          family: "M22759",
          partNumber: "WIRE-PERSIST-1",
          description: "Persisted wire",
          isActive: true,
          isReviewed: false,
          stockStatus: "unknown",
          attributes: {
            awg: "22",
            color: "white"
          },
          aliases: [{ codeSystem: "wire_3digit", code: "201" }]
        }
      ]
    });
    assert.equal(ingest.summary.committed, 2);

    await firstStore.upsertContactWireCompat({
      contactPartId: "cmp-contact-persist",
      wirePartId: "cmp-wire-persist",
      status: "allowed",
      notes: "persist-test",
      crimpClass: "ZZ"
    });
    firstStore.close();
    firstStore = undefined;

    secondStore = new SqliteStore(dbPath);
    const parts = await secondStore.listLibraryComponents({
      requestingUserId: "user-1",
      canViewAllUnreviewed: true,
      canViewInactive: true
    });
    assert.equal(parts.length, 2);
    assert.ok(parts.some((part) => part.id === "cmp-contact-persist"));
    assert.ok(parts.some((part) => part.id === "cmp-wire-persist"));

    const aliases = await secondStore.listPartAliases();
    assert.equal(aliases.length, 2);
    assert.ok(aliases.some((alias) => alias.codeSystem === "contact_3digit" && alias.code === "101"));
    assert.ok(aliases.some((alias) => alias.codeSystem === "wire_3digit" && alias.code === "201"));

    const compat = await secondStore.listContactWireCompat();
    assert.equal(compat.length, 1);
    assert.equal(compat[0]?.contactPartId, "cmp-contact-persist");
    assert.equal(compat[0]?.wirePartId, "cmp-wire-persist");
    assert.equal(compat[0]?.status, "allowed");
  } finally {
    firstStore?.close();
    secondStore?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("sqlite store persists bulk compat, bulk review, and awg-cma rows across instances", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-sqlite-bulk-"));
  const dbPath = path.join(tempDir, "app.db");
  let firstStore: SqliteStore | undefined;
  let secondStore: SqliteStore | undefined;

  try {
    firstStore = new SqliteStore(dbPath);
    const ingest = await firstStore.ingestLibraryComponents({
      requestedByUserId: "user-1",
      dryRun: false,
      items: [
        {
          id: "cmp-contact-bulk",
          category: "contact",
          family: "TP",
          partNumber: "CONTACT-BULK-1",
          description: "Bulk contact",
          isActive: true,
          isReviewed: false,
          stockStatus: "unknown",
          attributes: { acceptedFamilies: [] }
        },
        {
          id: "cmp-wire-bulk",
          category: "wire",
          family: "Single",
          partNumber: "WIRE-BULK-1",
          description: "Bulk wire",
          isActive: true,
          isReviewed: false,
          stockStatus: "unknown",
          attributes: { awg: "22", color: "white" }
        }
      ]
    });
    assert.equal(ingest.summary.committed, 2);

    const bulkCompat = await firstStore.bulkUpsertContactWireCompat({
      rows: [
        {
          contactPartId: "cmp-contact-bulk",
          wirePartId: "cmp-wire-bulk",
          status: "allowed",
          crimpClass: "ZZ"
        }
      ]
    });
    assert.equal(bulkCompat.upserted, 1);

    const bulkReview = await firstStore.bulkSetLibraryComponentReview({
      componentIds: ["cmp-contact-bulk", "cmp-wire-bulk", "missing-id"],
      reviewedByUserId: "admin-1"
    });
    assert.equal(bulkReview.reviewed, 2);
    assert.deepEqual(bulkReview.missing, ["missing-id"]);

    const bulkCma = await firstStore.bulkUpsertAwgCmaReference({
      rows: [
        { awg: "20", cma: 1020 },
        { awg: "22", cma: 640 }
      ]
    });
    assert.equal(bulkCma.upserted, 2);

    firstStore.close();
    firstStore = undefined;

    secondStore = new SqliteStore(dbPath);
    const compat = await secondStore.listContactWireCompat();
    assert.equal(compat.length, 1);
    assert.equal(compat[0]?.crimpClass, "ZZ");

    const parts = await secondStore.listLibraryComponents({
      requestingUserId: "someone-else",
      canViewAllUnreviewed: false,
      canViewInactive: false
    });
    assert.equal(parts.length, 2);
    assert.ok(parts.every((part) => part.isReviewed));

    const cmaRows = await secondStore.listAwgCmaReference();
    assert.equal(cmaRows.length, 2);
    assert.equal(cmaRows.find((row) => row.awg === "22")?.cma, 640);
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
