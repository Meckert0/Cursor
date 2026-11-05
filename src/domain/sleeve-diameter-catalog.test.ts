import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SqliteStore } from "../infra/store/sqlite-store.js";
import { isSleeveTubeBraidPart, type SleeveTubeBraidAttributes } from "./library.js";
import { buildSleeveDiameterCatalog, ensureSleeveDiameterCatalog } from "./sleeve-diameter-catalog.js";

test("covering catalog retains all seven supplied diameter ranges and strict lower bounds", () => {
  const items = buildSleeveDiameterCatalog();
  assert.deepEqual(items.map((item) => [
    item.partNumber, item.family, ...(item.attributes as SleeveTubeBraidAttributes).sizeRanges!.map(
      (range) => [range.minDia, range.maxDia, range.minInclusive]
    )
  ]), [
    ["875010", "expandable_sleeving", [0, 0.75, true]],
    ["875011", "expandable_sleeving", [0.75, 1.75, false]],
    ["875000", "shrink_tubing", [0, 1, true]],
    ["875001", "shrink_tubing", [1, 2, false]],
    ["875012", "wire_braid", [0, 0.38, true]],
    ["875013", "wire_braid", [0.38, 0.875, false]],
    ["875014", "wire_braid", [0.875, 2, false]]
  ]);
  assert.equal(new Set(items.map((item) => item.id)).size, 7);
  assert.ok(items.every((item) => item.isActive && item.isReviewed));
});

test("covering catalog fills missing ranges, preserves existing metadata, and persists without duplicates", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cdt-sleeve-catalog-"));
  const dbPath = path.join(tempDir, "app.db");
  let store: SqliteStore | undefined;
  try {
    store = new SqliteStore(dbPath);
    await store.ingestLibraryComponents({
      requestedByUserId: "editor",
      dryRun: false,
      items: [{
        ...buildSleeveDiameterCatalog()[0],
        id: "existing-sleeve",
        description: "Existing shop description",
        stockStatus: "in_stock",
        attributes: { sizeRanges: [] }
      }]
    });
    assert.deepEqual(await ensureSleeveDiameterCatalog(store), { inserted: 6, updated: 1, skipped: 0 });
    store.close();
    store = new SqliteStore(dbPath);
    assert.deepEqual(await ensureSleeveDiameterCatalog(store), { inserted: 0, updated: 0, skipped: 7 });
    const parts = (await store.listLibraryComponents({
      requestingUserId: "viewer",
      canViewAllUnreviewed: false,
      canViewInactive: false
    })).filter(isSleeveTubeBraidPart);
    assert.equal(parts.length, 7);
    assert.equal(parts.find((part) => part.partNumber === "875011")?.attributes.sizeRanges?.[0].minInclusive, false);
    const existing = parts.find((part) => part.partNumber === "875010");
    assert.equal(existing?.id, "existing-sleeve");
    assert.equal(existing?.description, "Existing shop description");
    assert.equal(existing?.stockStatus, "in_stock");
    assert.equal(existing?.attributes.sizeRanges?.[0].maxDia, 0.75);
  } finally {
    store?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
