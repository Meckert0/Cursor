import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { buildSleeveDiameterCatalog, ensureSleeveDiameterCatalog } from "../../domain/sleeve-diameter-catalog.js";
import { isSleeveTubeBraidPart } from "../../domain/library.js";
import { PostgresStore } from "./postgres-store.js";
import { PostgresAuthStore } from "../auth/postgres-auth-store.js";
import { MemoryLockManager } from "../locks/memory-lock-manager.js";
import { FileArtifactStorage } from "../storage/file-artifact-storage.js";
import { PassthroughArtifactDownloadUrlResolver } from "../storage/artifact-download-url-resolver.js";
import { buildApp } from "../../app.js";
import { hashPassword } from "../../auth/session.js";
import { ExportQueueService } from "../../services/export-queue.js";
import { ensureWireDiameterCatalog } from "../../domain/wire-diameter-catalog.js";

async function database(applyBoundaryMigration: boolean) {
  const db = new PGlite();
  const directory = new URL("../../../db/migrations/", import.meta.url);
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    if (!applyBoundaryMigration && name.startsWith("031_")) continue;
    await db.exec(await readFile(new URL(name, directory), "utf8"));
  }
  const query = async (sql: string, values?: unknown[]) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { db, pool, store: new PostgresStore(pool) };
}

for (const migrated of [false, true]) {
  test(`PostgreSQL catalog startup and login work ${migrated ? "with" : "without"} migration 031`, async () => {
    const { db, pool, store } = await database(migrated);
    try {
      assert.equal((await ensureWireDiameterCatalog(store)).inserted, 47);
      assert.deepEqual(await ensureSleeveDiameterCatalog(store), { inserted: 7, updated: 0, skipped: 0 });
      assert.deepEqual(await ensureSleeveDiameterCatalog(store), { inserted: 0, updated: 0, skipped: 7 });
      const parts = (await store.listLibraryComponents({
        requestingUserId: "viewer", canViewAllUnreviewed: false, canViewInactive: false
      })).filter(isSleeveTubeBraidPart);
      assert.equal(parts.length, 7);
      assert.equal(parts.find((part) => part.partNumber === "875011")?.attributes.sizeRanges?.[0].minInclusive, false);
      assert.equal(parts.find((part) => part.partNumber === "875010")?.attributes.sizeRanges?.[0].minInclusive, true);

      const large = parts.find((part) => part.partNumber === "875011")!;
      const changed = await store.updateLibraryComponent({
        componentId: large.id, attributes: { sizeRanges: [{ minDia: 0.75, maxDia: 1.75, minInclusive: false }] },
        extraAttributes: { shopNote: "Keep this metadata" }, editedByUserId: "editor"
      });
      assert.ok(changed && isSleeveTubeBraidPart(changed));
      assert.equal(changed.attributes.sizeRanges?.[0].minInclusive, false);
      assert.deepEqual(changed.extraAttributes, { shopNote: "Keep this metadata" });
      const metadataOnly = await store.updateLibraryComponent({
        componentId: large.id, extraAttributes: { shopNote: "Updated metadata" }, editedByUserId: "editor"
      });
      assert.ok(metadataOnly && isSleeveTubeBraidPart(metadataOnly));
      assert.equal(metadataOnly.attributes.sizeRanges?.[0].minInclusive, false);
      assert.deepEqual(metadataOnly.extraAttributes, { shopNote: "Updated metadata" });

      const item = { ...buildSleeveDiameterCatalog()[0], attributes: { sizeRanges: [{ minDia: 0, maxDia: 0.75 }] } };
      const ingest = await store.ingestLibraryComponents({ items: [item], requestedByUserId: "editor", dryRun: false });
      assert.equal(ingest.summary.committed, 1);
      const unchanged = await store.getLibraryComponent({
        componentId: item.id!, requestingUserId: "viewer", canViewAllUnreviewed: true, canViewInactive: true
      });
      assert.equal(unchanged?.isReviewed, true, "An equivalent default-inclusive range does not revoke review");

      if (migrated) {
        // Parts written by the previous runtime may have only the SQL flag.
        await db.query("UPDATE parts SET extra_attributes = '{}'::jsonb WHERE id = $1", [large.id]);
        await db.query("UPDATE sleeve_size_ranges SET min_inclusive = FALSE WHERE part_id = $1", [large.id]);
        const legacy = await store.getLibraryComponent({
          componentId: large.id, requestingUserId: "viewer", canViewAllUnreviewed: true, canViewInactive: true
        });
        assert.ok(legacy && isSleeveTubeBraidPart(legacy));
        assert.equal(legacy.attributes.sizeRanges?.[0].minInclusive, false);
      }

      const authStore = new PostgresAuthStore(pool);
      await authStore.createUser({
        username: "postgres-login", email: "postgres-login@example.com", passwordHash: await hashPassword("test-password-123"),
        role: "owner", accountRole: "regular"
      });
      const artifactStorage = new FileArtifactStorage(process.cwd());
      const app = buildApp({
        store, authStore, artifactStorage,
        lockManager: new MemoryLockManager(),
        exportQueue: new ExportQueueService(store, artifactStorage),
        artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver()
      });
      try {
        const response = await app.inject({
          method: "POST", url: "/v1/auth/login", payload: { email: "postgres-login@example.com", password: "test-password-123" }
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().user.id, "postgres-login");
        assert.ok(response.json().sessionToken);
      } finally {
        await app.close();
      }
    } finally {
      await db.close();
    }
  });
}
