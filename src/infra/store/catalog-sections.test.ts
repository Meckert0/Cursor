import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { MemoryStore } from "./memory-store.js";
import { SqliteStore } from "./sqlite-store.js";
import { PostgresStore } from "./postgres-store.js";
import { assertCatalogSchemaReady } from "./catalog-schema.js";
import type { Store } from "./store.js";
import { makePart } from "../../domain/part-test-helpers.js";
import type { PartIngestItem } from "../../domain/library.js";

const migrationDirectory = new URL("../../../db/migrations/", import.meta.url);

async function postgres(beforeCatalogMigration = false) {
  const db = new PGlite();
  for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort()) {
    if (beforeCatalogMigration && name.startsWith("032_")) continue;
    await db.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
  }
  const query = async (sql: string, values?: unknown[]) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { db, pool, store: new PostgresStore(pool) };
}

const fixtures: PartIngestItem[] = [
  makePart({ id: "frame", category: "frame", family: "Test", partNumber: "F-1", description: "Frame", attributes: { slotIds: ["A", "B"] } }),
  makePart({ id: "module", category: "module", family: "Test", partNumber: "M-1", description: "Module", attributes: { pinIds: ["1", "2"] } }),
  makePart({ id: "contact", category: "contact", family: "Test", partNumber: "C-1", description: "Contact", attributes: { acceptedFamilies: [], acceptedGauges: ["20", "24"] } }),
  makePart({ id: "wire", category: "wire", family: "Coax", partNumber: "W-1", description: "Coax", attributes: { cableDesignation: "RG-316", construction: "coax", color: "white", overallDia: 0.103 } }),
  makePart({ id: "label", category: "label", family: "Test", partNumber: "00123", description: "Label", attributes: { diaIn: 0.25, fitDiameterMinIn: 0.04, fitDiameterMaxIn: 0.12, maxCharactersPerLine: 18, maxLines: 2, printableWidthIn: 0.75, printableHeightIn: 0.2, printProfile: "Mono 8 pt" } })
];

for (const backend of ["memory", "sqlite", "postgres"] as const) {
  test(`${backend}: canonical compatibility, labels and media survive edits and persistence`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "catalog-sections-"));
    const pg = backend === "postgres" ? await postgres() : undefined;
    let store: Store = pg?.store ?? (backend === "sqlite" ? new SqliteStore(path.join(directory, "app.db")) : new MemoryStore());
    try {
      const originalCopy = await store.getUiCopySettings();
      assert.equal(originalCopy.adminSectionTitles.database, "Database");
      await store.updateUiCopySettings({ adminSectionTitles: { database: "Part catalog", media: "Reference views" } });
      const updatedCopy = await store.updateUiCopySettings({ projectsHeaderDescription: "Custom projects description" });
      assert.equal(updatedCopy.adminSectionTitles.database, "Part catalog");
      assert.equal(updatedCopy.adminSectionTitles.items, "Item Database Viewer");
      assert.equal(updatedCopy.harnessHeaderDescription, originalCopy.harnessHeaderDescription);
      updatedCopy.adminSectionTitles.database = "Unsaved external change";
      assert.equal((await store.getUiCopySettings()).adminSectionTitles.database, "Part catalog");
      const result = await store.ingestLibraryComponents({ requestedByUserId: "test", dryRun: false, items: fixtures });
      assert.equal(result.summary.committed, fixtures.length);
      const group = await store.upsertPartRelationship({ parentPartId: "frame", relationshipType: "MODULE_ALLOWED", compatibleParts: "M-1", parentPositions: ["A"], status: "allowed", source: "manufacturer-drawing" });
      assert.deepEqual(group.targetPartIds, ["module"]);
      assert.equal(group.isExhaustive, true);
      await store.updateLibraryComponent({ componentId: "module", partNumber: "M-RENAMED", editedByUserId: "test" });
      assert.deepEqual((await store.listPartRelationships({ compatiblePart: "M-RENAMED" }))[0].compatibleParts, ["M-RENAMED"]);
      assert.deepEqual((await store.listPartRelationships())[0].targetPartIds, ["module"]);

      await store.upsertContactWireCompat({ contactPartId: "contact", wirePartId: "wire", status: "review", crimpClass: "B", notes: "Verify crimp" });
      assert.equal((await store.listPartRelationships()).length, 2, "Pair endpoints write to the same canonical catalog");
      assert.equal((await store.listContactWireCompat())[0].crimpClass, "B");
      await store.upsertContactWireCompat({ contactPartId: "contact", wirePartId: "wire", status: "forbidden" });
      assert.equal((await store.listContactWireCompat())[0].status, "forbidden");
      assert.equal((await store.listPartRelationships()).length, 2, "Updating a pair replaces its status");

      await assert.rejects(store.upsertPartRelationship({ parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["contact"], parentPositions: [], status: "allowed" }), /TARGET_CATEGORY/);
      await assert.rejects(store.upsertPartRelationship({ parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["module"], parentPositions: ["Z"], status: "allowed" }), /POSITION_NOT_FOUND/);
      await assert.rejects(store.bulkUpsertPartRelationships({ rows: [
        { parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["module"], parentPositions: ["B"], status: "allowed" },
        { parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["missing"], parentPositions: [], status: "allowed" }
      ] }));
      assert.equal((await store.listPartRelationships()).length, 2, "Invalid batches are atomic");
      await assert.rejects(store.deleteLibraryComponent({ componentId: "module" }));

      const forbidden = await store.upsertPartRelationship({ parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["module"], parentPositions: ["A"], status: "forbidden" });
      await assert.rejects(store.bulkUpsertPartRelationships({ rows: [
        { parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["module"], parentPositions: ["B"], status: "allowed" },
        { ...group, status: "forbidden" }
      ] }), /GROUP_CONFLICT/);
      assert.equal((await store.listPartRelationships()).length, 3);
      await store.deletePartRelationship({ id: forbidden.id });

      const lookup = { componentId: "label", requestingUserId: "test", canViewAllUnreviewed: true, canViewInactive: true };
      const label = await store.getLibraryComponent(lookup);
      assert.equal(label?.partNumber, "00123");
      assert.equal(label?.category === "label" && label.attributes.maxCharactersPerLine, 18);
      await assert.rejects(store.updateLibraryComponent({ componentId: "label", attributes: { fitDiameterMinIn: 0.5 } }), /DIAMETER_RANGE/);
      await store.updateLibraryComponent({ componentId: "label", attributes: { maxLines: 3 } });
      const changed = await store.getLibraryComponent(lookup);
      assert.equal(changed?.category === "label" && changed.attributes.fitDiameterMinIn, 0.04);
      assert.equal(changed?.category === "label" && changed.attributes.maxLines, 3);

      await store.ingestLibraryComponents({ requestedByUserId: "test", dryRun: false, items: [{ ...fixtures[4], attributes: { series: "Updated source" } }] });
      const reimported = await store.getLibraryComponent(lookup);
      assert.equal(reimported?.category === "label" && reimported.attributes.fitDiameterMinIn, 0.04);
      assert.equal(reimported?.category === "label" && reimported.attributes.maxLines, 3, "Imports preserve catalog facts absent from the source");

      const first = await store.upsertPartMedia({ partId: "module", url: "HTTPS://example.com/side.png", viewType: "side_profile", orientation: "left", isPrimary: true, altText: "Module side", pixelWidth: 300 });
      const second = await store.upsertPartMedia({ partId: "module", url: "https://example.com/side2.png", viewType: "side_profile", orientation: "left", isPrimary: true, source: "Drawing 7", revision: "B" });
      await store.upsertPartMedia({ partId: "module", url: "https://example.com/face.png", viewType: "mating_face", orientation: "looking_into_mating_face", isPrimary: true });
      await assert.rejects(store.upsertPartMedia({ ...second, partId: "frame" }), /PART_MISMATCH/);
      await assert.rejects(store.upsertPartMedia({ partId: "module", url: "javascript:alert(1)", viewType: "side_profile" }), /MEDIA_URL/);
      assert.equal(await store.deletePartMedia({ id: first.id, partId: "frame" }), false);
      if (store instanceof SqliteStore) {
        store.close();
        store = new SqliteStore(path.join(directory, "app.db"));
      } else if (store instanceof MemoryStore) store = MemoryStore.fromState(store.exportState());
      assert.equal((await store.getUiCopySettings()).adminSectionTitles.database, "Part catalog");
      assert.equal((await store.getUiCopySettings()).adminSectionTitles.media, "Reference views");
      assert.equal((await store.getUiCopySettings()).projectsHeaderDescription, "Custom projects description");
      const media = await store.listPartMedia({ partId: "module" });
      assert.equal(media.length, 3);
      assert.equal(media.find(row => row.id === first.id)?.isPrimary, false);
      assert.equal(media.find(row => row.id === second.id)?.isPrimary, true);
      assert.equal(media.find(row => row.id === second.id)?.revision, "B");
      assert.deepEqual((await store.listPartRelationships({ parentPartId: "frame" }))[0].compatibleParts, ["M-RENAMED"]);
      assert.equal(await store.deleteContactWireCompat({ contactPartId: "contact", wirePartId: "wire" }), true);
      assert.equal((await store.listContactWireCompat()).length, 0);
    } finally {
      if (store instanceof SqliteStore) store.close();
      await pg?.db.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("migration preserves legacy sources, unresolved targets, scoped rules and nominal label diameter", async () => {
  const { db, pool, store } = await postgres(true);
  try {
    await assert.rejects(assertCatalogSchemaReady(pool), /CATALOG_SCHEMA_NOT_READY: Apply 032_catalog_sections.sql/);
    await db.query("INSERT INTO app_settings (key, value) VALUES ('ui.projectsHeaderDescription', 'Existing page copy') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
    const legacyCopy = await store.getUiCopySettings();
    assert.equal(legacyCopy.projectsHeaderDescription, "Existing page copy");
    assert.equal(legacyCopy.adminSectionTitles.database, "Database", "Existing databases need no settings migration");
    assert.equal((await db.query<{ name: string | null }>("SELECT to_regclass('compatibility_groups') AS name")).rows[0].name, null,
      "The deployment check must not apply migrations");
    for (const part of fixtures) {
      await db.query(`INSERT INTO parts (id, category, part_number, family, description, stock_status, created_by_user_id, created_at, last_edited_by_user_id, last_edited_at, updated_at) VALUES ($1,$2,$3,'Test','Legacy','in_stock','test',NOW(),'test',NOW(),NOW())`, [part.id, part.category, part.partNumber]);
    }
    await db.exec(`
      INSERT INTO frames (part_id, slot_ids_json) VALUES ('frame', '["A","B"]');
      INSERT INTO modules (part_id, pin_ids_json) VALUES ('module', '["1","2"]');
      INSERT INTO contacts (part_id, accepted_gauges_json) VALUES ('contact', '["20","24"]');
      INSERT INTO wires (part_id, awg, color) VALUES ('wire', 'RG-316', 'white');
      INSERT INTO labels (part_id, dia_in) VALUES ('label', 0.25);
      INSERT INTO part_relationships (id, parent_part_id, compatible_parts, relationship_type, parent_positions_json, status, notes)
        VALUES ('legacy-contact', 'module', 'C-1', 'CONTACT_ALLOWED', '["1"]', 'allowed', 'Pin 1 only'),
               ('legacy-frame', 'frame', 'M-1, UNKNOWN-PN', 'MODULE_ALLOWED', '["A"]', 'review', 'Original note');
      INSERT INTO module_contact_compat (module_part_id, contact_part_id, status, source) VALUES ('module','contact','allowed','vpc-catalog');
      INSERT INTO contact_wire_compat (contact_part_id, wire_part_id, status, crimp_class) VALUES ('contact','wire','review','B');
    `);
    await db.exec(await readFile(new URL("032_catalog_sections.sql", migrationDirectory), "utf8"));
    await assert.doesNotReject(assertCatalogSchemaReady(pool));
    const groups = await store.listPartRelationships();
    assert.equal(groups.length, 3, "Derived VPC aggregate is not duplicated as unscoped evidence");
    assert.deepEqual(groups.find(row => row.id === "legacy-contact")?.parentPositions, ["1"]);
    assert.equal(groups.find(row => row.id === "legacy-contact")?.notes, "Pin 1 only");
    assert.deepEqual(groups.find(row => row.id === "legacy-frame")?.unresolvedParts, ["UNKNOWN-PN"]);
    assert.deepEqual(groups.find(row => row.id === "legacy-frame")?.targetPartIds, ["module"]);
    const wire = await store.getLibraryComponent({ componentId: "wire", requestingUserId: "test", canViewAllUnreviewed: true, canViewInactive: true });
    assert.equal(wire?.category === "wire" && wire.attributes.awg, undefined);
    assert.equal(wire?.category === "wire" && wire.attributes.cableDesignation, "RG-316");
    const label = await store.getLibraryComponent({ componentId: "label", requestingUserId: "test", canViewAllUnreviewed: true, canViewInactive: true });
    assert.equal(label?.category === "label" && label.attributes.diaIn, 0.25);
    assert.equal(label?.category === "label" && label.attributes.fitDiameterMinIn, undefined);
    assert.equal((await db.query<{ compatible_parts: string }>("SELECT compatible_parts FROM part_relationships WHERE id='legacy-frame'")).rows[0].compatible_parts, "M-1, UNKNOWN-PN");
    assert.equal((await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM module_contact_compat")).rows[0].count, 1);
    await db.exec("ALTER TABLE labels DROP COLUMN text_allowance_notes");
    await assert.rejects(assertCatalogSchemaReady(pool), /Missing: labels.text_allowance_notes$/);
  } finally { await db.close(); }
});
