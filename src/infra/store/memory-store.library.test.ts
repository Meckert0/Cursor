import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "./memory-store.js";

test("memory store round-trips VPC catalog types and generic relationships", async () => {
  const store = new MemoryStore();
  const ingest = await store.ingestLibraryComponents({
    requestedByUserId: "tester",
    dryRun: false,
    items: [
      {
        id: "frame-1",
        category: "frame",
        family: "iCon",
        partNumber: "ITA-1",
        description: "ITA frame",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: false,
        partType: "ITA",
        side: "ITA",
        electricalMode: "NONE",
        attributes: { moduleCapacity: 2, slotIds: ["A", "B"] }
      },
      {
        id: "mod-1",
        category: "module",
        family: "iCon",
        partNumber: "MOD-1",
        description: "Module",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: false,
        partType: "MODULE",
        side: "ITA",
        attributes: { positionCount: 8, pinIds: ["1", "2"], simSlotSections: [] }
      },
      {
        id: "sim-1",
        category: "module",
        family: "iCon",
        partNumber: "SIM-1",
        description: "SIM insert",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: false,
        partType: "SIM_INSERT",
        attributes: { slotOccupancy: 1, pinIds: [] }
      },
      {
        id: "cnt-1",
        category: "contact",
        family: "QP",
        partNumber: "CNT-1",
        description: "Contact",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: false,
        partType: "CONTACT",
        side: "ITA",
        attributes: { acceptedFamilies: [], acceptedGauges: ["22", "RG316"], wireInterface: "coax" }
      }
    ]
  });
  assert.equal(ingest.summary.committed, 4);

  const listed = await store.listLibraryComponents({
    requestingUserId: "tester",
    canViewAllUnreviewed: true,
    canViewInactive: true
  });
  const frame = listed.find((part) => part.id === "frame-1");
  assert.equal(frame?.category, "frame");
  assert.equal(frame?.partType, "ITA");
  if (frame?.category === "frame") {
    assert.equal(frame.attributes.moduleCapacity, 2);
    assert.deepEqual(frame.attributes.slotIds, ["A", "B"]);
  }

  const contact = listed.find((part) => part.id === "cnt-1");
  assert.equal(contact?.category, "contact");
  if (contact?.category === "contact") {
    assert.deepEqual(contact.attributes.acceptedGauges, ["22", "RG316"]);
    assert.equal(contact.attributes.wireInterface, "coax");
  }

  const updated = await store.updateLibraryComponent({
    componentId: "mod-1",
    notes: "slot A preferred",
    electricalMode: "CONTACT",
    editedByUserId: "tester"
  });
  assert.equal(updated?.notes, "slot A preferred");
  assert.equal(updated?.electricalMode, "CONTACT");

  const allowed = await store.upsertPartRelationship({
    parentPartId: "frame-1",
    childPartId: "mod-1",
    relationshipType: "MODULE_ALLOWED",
    positionType: "MODULE_SLOT",
    parentPositions: ["A", "B"],
    status: "allowed",
    sourceStatus: "CONFIRMED"
  });
  assert.equal(allowed.relationshipType, "MODULE_ALLOWED");
  const rerun = await store.upsertPartRelationship({
    parentPartId: "frame-1",
    childPartId: "mod-1",
    relationshipType: "MODULE_ALLOWED",
    positionType: "MODULE_SLOT",
    parentPositions: ["A"],
    status: "review",
    sourceStatus: "CONDITIONAL_CLEARANCE"
  });
  assert.equal(rerun.id, allowed.id);
  assert.equal(rerun.status, "review");
  assert.deepEqual(rerun.parentPositions, ["A"]);

  const wireRule = await store.upsertPartRelationship({
    parentPartId: "cnt-1",
    relationshipType: "WIRE_COMPATIBILITY",
    positionType: "WIRE",
    parentPositions: ["22", "RG316"],
    status: "allowed",
    extra: { gauges: ["22", "RG316"] }
  });
  assert.equal(wireRule.childPartId, undefined);

  const listedRels = await store.listPartRelationships({ parentPartId: "frame-1" });
  assert.equal(listedRels.length, 1);

  assert.equal(await store.deletePartRelationship({ id: allowed.id }), true);
  assert.equal((await store.listPartRelationships({ parentPartId: "frame-1" })).length, 0);

  assert.equal(await store.deleteLibraryComponent({ componentId: "cnt-1" }), true);
  assert.equal((await store.listPartRelationships()).length, 0);
});
