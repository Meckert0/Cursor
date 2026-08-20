import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { PostgresStore } from "./postgres-store.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  "postgres store parts/compat/alias CRUD round-trip",
  { skip: !databaseUrl ? "DATABASE_URL not set" : false },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const store = new PostgresStore(pool);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const moduleId = `pg-mod-${suffix}`;
    const contactId = `pg-cnt-${suffix}`;
    const wireId = `pg-wre-${suffix}`;
    const backshellId = `pg-bs-${suffix}`;
    const strainId = `pg-sr-${suffix}`;
    const frameId = `pg-frm-${suffix}`;

    try {
      // Ensure parts schema exists (migration 027).
      await pool.query("SELECT 1 FROM parts LIMIT 1");

      const ingest = await store.ingestLibraryComponents({
        requestedByUserId: "pg-test",
        dryRun: false,
        items: [
          {
            id: moduleId,
            category: "module",
            family: "Micro-D",
            partNumber: `MDM-${suffix}`,
            description: "PG test module",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes: { pinCount: 9, pinIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] }
          },
          {
            id: contactId,
            category: "contact",
            family: "Micro-D",
            partNumber: `CNT-${suffix}`,
            description: "PG test contact",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes: { acceptedFamilies: ["MIL-W-22759"] }
          },
          {
            id: wireId,
            category: "wire",
            family: "MIL-W-22759",
            partNumber: `WRE-${suffix}`,
            description: "PG test wire",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes: { awg: "22", color: "white" }
          },
          {
            id: backshellId,
            category: "backshell",
            family: "EMI",
            partNumber: `BS-${suffix}`,
            description: "PG test backshell",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes: {}
          },
          {
            id: strainId,
            category: "strain-relief",
            family: "Clamp",
            partNumber: `SR-${suffix}`,
            description: "PG test strain relief",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes: {}
          },
          {
            id: frameId,
            category: "frame",
            family: "iCon",
            partNumber: `ITA-${suffix}`,
            description: "PG test frame",
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            partType: "ITA",
            side: "ITA",
            electricalMode: "NONE",
            attributes: { moduleCapacity: 2, slotIds: ["A", "B"] }
          }
        ]
      });
      assert.equal(ingest.summary.committed, 6);

      const listed = await store.listLibraryComponents({
        requestingUserId: "pg-test",
        canViewAllUnreviewed: true,
        canViewInactive: true
      });
      assert.ok(listed.some((part) => part.id === moduleId));

      const updated = await store.updateLibraryComponent({
        componentId: wireId,
        attributes: { awg: "22", color: "black", milSpec: "M22759/16" },
        editedByUserId: "pg-test"
      });
      assert.ok(updated);
      assert.equal(updated.category, "wire");
      if (updated.category === "wire") {
        assert.equal(updated.attributes.color, "black");
        assert.equal(updated.attributes.milSpec, "M22759/16");
      }

      const reviewed = await store.setLibraryComponentReview({
        componentId: moduleId,
        isReviewed: true,
        reviewedByUserId: "pg-reviewer"
      });
      assert.equal(reviewed?.isReviewed, true);

      const contactWire = await store.upsertContactWireCompat({
        contactPartId: contactId,
        wirePartId: wireId,
        status: "allowed",
        notes: "pg test"
      });
      assert.equal(contactWire.status, "allowed");
      const contactWireList = await store.listContactWireCompat();
      assert.ok(contactWireList.some((row) => row.contactPartId === contactId && row.wirePartId === wireId));

      await store.upsertModuleContactCompat({
        modulePartId: moduleId,
        contactPartId: contactId,
        status: "forbidden"
      });
      await store.upsertModuleBackshellCompat({
        modulePartId: moduleId,
        backshellPartId: backshellId,
        status: "review"
      });
      await store.upsertModuleStrainReliefCompat({
        modulePartId: moduleId,
        strainReliefPartId: strainId,
        status: "allowed"
      });

      const alias = await store.upsertPartAlias({
        partId: contactId,
        codeSystem: "contact_3digit",
        code: `9${String(suffix).slice(-2)}`
      });
      assert.equal(alias.partId, contactId);
      const aliases = await store.listPartAliases({ partId: contactId });
      assert.equal(aliases.length, 1);

      const relationship = await store.upsertPartRelationship({
        parentPartId: frameId,
        childPartId: moduleId,
        relationshipType: "MODULE_ALLOWED",
        positionType: "MODULE_SLOT",
        parentPositions: ["A", "B"],
        status: "allowed",
        sourceStatus: "CONFIRMED"
      });
      assert.equal(relationship.relationshipType, "MODULE_ALLOWED");
      const listedRels = await store.listPartRelationships({ parentPartId: frameId });
      assert.equal(listedRels.length, 1);
      assert.equal(await store.deletePartRelationship({ id: relationship.id }), true);

      assert.equal(await store.deleteContactWireCompat({ contactPartId: contactId, wirePartId: wireId }), true);
      assert.equal(await store.deleteModuleContactCompat({ modulePartId: moduleId, contactPartId: contactId }), true);
      assert.equal(
        await store.deleteModuleBackshellCompat({ modulePartId: moduleId, backshellPartId: backshellId }),
        true
      );
      assert.equal(
        await store.deleteModuleStrainReliefCompat({ modulePartId: moduleId, strainReliefPartId: strainId }),
        true
      );
      assert.equal(await store.deletePartAlias({ codeSystem: alias.codeSystem, code: alias.code }), true);

      const archived = await store.archiveLibraryComponent({
        componentId: moduleId,
        archivedByUserId: "pg-test"
      });
      assert.equal(archived?.isArchived, true);
      assert.equal(await store.deleteLibraryComponent({ componentId: moduleId }), true);
      assert.equal(await store.deleteLibraryComponent({ componentId: contactId }), true);
      assert.equal(await store.deleteLibraryComponent({ componentId: wireId }), true);
      assert.equal(await store.deleteLibraryComponent({ componentId: backshellId }), true);
      assert.equal(await store.deleteLibraryComponent({ componentId: strainId }), true);
      assert.equal(await store.deleteLibraryComponent({ componentId: frameId }), true);
    } finally {
      await pool.end();
    }
  }
);
