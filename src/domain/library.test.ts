import assert from "node:assert/strict";
import test from "node:test";
import {
  displayPartType,
  catalogPartFamily,
  normalizeBlankModuleFamily,
  emptyAttributesForCategory,
  isCanvasConnectorPart,
  isCanvasDefinablePart,
  isCanvasFramePart,
  normalizePartRelationship,
  partRelationshipNaturalKey,
  type ContactAttributes,
  type ModuleAttributes
} from "./library.js";

test("blank filler families are separate from physical sides and empty SIM hosts", () => {
  const blank = { category: "module", family: "ITA/RCV", description: "Blank module", electricalMode: "NONE", attributes: { pinIds: [], positionCount: 0 } };
  assert.equal(catalogPartFamily(blank), "Blank insert");
  assert.equal(catalogPartFamily({ ...blank, description: "Blanking insert" }), "Blank insert");
  assert.equal(catalogPartFamily({ ...blank, description: "Module", attributes: { contactFamily1: "BLANK" } }), "Blank insert");
  for (const attributes of [{ positionCount: 1 }, { pinCount: 2 }, { pinCount2: 2 }, { pinIds: ["1"] }, { contactPositions: [{ pinCount: 4 }] }, { simSlotCount: 16 }, { simSlotSections: [["1", "2"]] }]) {
    assert.equal(catalogPartFamily({ ...blank, electricalMode: "SELECTABLE", attributes }), blank.family);
  }
  assert.equal(catalogPartFamily({ ...blank, attributes: { positionCount: 160, pinCount: 160 } }), "Blank insert");
  assert.equal(catalogPartFamily({ ...blank, family: "BLANK INSERT", electricalMode: undefined, attributes: { pinCount: 160 } }), "Blank insert");
  assert.equal(catalogPartFamily({ ...blank, family: "Blank insert", electricalMode: "INSERT_HOST" }), "Blank insert");
  assert.equal(catalogPartFamily({ ...blank, attributes: { simSlotCount: 16 } }), blank.family);
  assert.equal(catalogPartFamily({ ...blank, electricalMode: "INSERT_HOST" }), blank.family);
  assert.equal(catalogPartFamily({ ...blank, category: "frame" }), blank.family);
  assert.equal(catalogPartFamily({ ...blank, description: "Signal module" }), blank.family);
  assert.equal(normalizeBlankModuleFamily(blank).family, "Blank insert");
  assert.equal(blank.family, "ITA/RCV");
});

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

test("isCanvasDefinablePart includes ITA and Receiver frames", () => {
  assert.equal(isCanvasFramePart({ category: "frame", partType: "ITA" }), true);
  assert.equal(isCanvasFramePart({ category: "frame", partType: "RECEIVER" }), true);
  assert.equal(isCanvasFramePart({ category: "frame", partType: "RCV" }), true);
  assert.equal(isCanvasDefinablePart({ category: "module", partType: "MODULE" }), true);
  assert.equal(isCanvasDefinablePart({ category: "frame", partType: "ITA" }), true);
  assert.equal(isCanvasDefinablePart({ category: "module", partType: "SIM_INSERT" }), false);
  assert.equal(displayPartType("RECEIVER"), "RCV");
  assert.equal(displayPartType("ITA"), "ITA");
});

test("normalizePartRelationship trims identity and parses compatible parts", () => {
  const row = normalizePartRelationship({
    parentPartId: " parent ",
    compatibleParts: " 510161101 , ,510161102 ",
    relationshipType: " WIRE_COMPATIBILITY ",
    positionType: " WIRE ",
    parentPositions: [" 22 ", "", "24"],
    status: "allowed",
    extra: {}
  });
  assert.equal(row.parentPartId, "parent");
  assert.deepEqual(row.compatibleParts, ["510161101", "510161102"]);
  assert.equal(row.relationshipType, "WIRE_COMPATIBILITY");
  assert.equal(row.positionType, "WIRE");
  assert.deepEqual(row.parentPositions, ["22", "24"]);
  assert.equal(row.extra, undefined);
  assert.equal(
    partRelationshipNaturalKey(row),
    "parent::WIRE_COMPATIBILITY::WIRE::22,24::allowed"
  );

  const empty = normalizePartRelationship({
    parentPartId: "parent",
    compatibleParts: "  ",
    relationshipType: "WIRE_COMPATIBILITY",
    parentPositions: [],
    status: "allowed"
  });
  assert.deepEqual(empty.compatibleParts, []);
});
