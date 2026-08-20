import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyAttributesForCategory,
  isCanvasConnectorPart,
  normalizePartRelationship,
  partRelationshipNaturalKey,
  type ContactAttributes,
  type ModuleAttributes
} from "./library.js";

test("emptyAttributesForCategory covers frame and VPC module/contact lists", () => {
  assert.deepEqual(emptyAttributesForCategory("frame"), { slotIds: [] });
  const moduleAttrs = emptyAttributesForCategory("module") as ModuleAttributes;
  assert.deepEqual(moduleAttrs.pinIds, []);
  assert.deepEqual(moduleAttrs.simSlotSections, []);
  const contactAttrs = emptyAttributesForCategory("contact") as ContactAttributes;
  assert.deepEqual(contactAttrs.acceptedGauges, []);
});

test("isCanvasConnectorPart hides frames and SIM inserts", () => {
  assert.equal(isCanvasConnectorPart({ category: "module" }), true);
  assert.equal(isCanvasConnectorPart({ category: "module", partType: "MODULE" }), true);
  assert.equal(isCanvasConnectorPart({ category: "module", partType: "SIM_INSERT" }), false);
  assert.equal(isCanvasConnectorPart({ category: "frame", partType: "ITA" }), false);
  assert.equal(isCanvasConnectorPart({ category: "contact", partType: "CONTACT" }), false);
});

test("normalizePartRelationship trims identity and collapses empty child", () => {
  const row = normalizePartRelationship({
    parentPartId: " parent ",
    childPartId: "  ",
    relationshipType: " WIRE_COMPATIBILITY ",
    positionType: " WIRE ",
    parentPositions: [" 22 ", "", "24"],
    status: "allowed",
    extra: {}
  });
  assert.equal(row.parentPartId, "parent");
  assert.equal(row.childPartId, undefined);
  assert.equal(row.relationshipType, "WIRE_COMPATIBILITY");
  assert.equal(row.positionType, "WIRE");
  assert.deepEqual(row.parentPositions, ["22", "24"]);
  assert.equal(row.extra, undefined);
  assert.equal(
    partRelationshipNaturalKey(row),
    "parent::::WIRE_COMPATIBILITY::WIRE"
  );
});
