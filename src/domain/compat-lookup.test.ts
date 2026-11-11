import test from "node:test";
import assert from "node:assert/strict";
import { createCompatLookup } from "./compat-lookup.js";

test("createCompatLookup returns status for each junction kind and undefined when absent", () => {
  const lookup = createCompatLookup({
    contactWire: [{ contactPartId: "c1", wirePartId: "w1", status: "forbidden" }],
    moduleContact: [{ modulePartId: "m1", contactPartId: "c1", status: "review" }],
    moduleBackshell: [{ modulePartId: "m1", backshellPartId: "b1", status: "allowed" }],
    moduleStrainRelief: [{ modulePartId: "m1", strainReliefPartId: "s1", status: "forbidden" }]
  });

  assert.equal(lookup.contactWire("c1", "w1"), "forbidden");
  assert.equal(lookup.moduleContact("m1", "c1"), "review");
  assert.equal(lookup.moduleBackshell("m1", "b1"), "allowed");
  assert.equal(lookup.moduleStrainRelief("m1", "s1"), "forbidden");

  assert.equal(lookup.contactWire("c1", "missing"), undefined);
  assert.equal(lookup.moduleContact("m1", "missing"), undefined);
  assert.equal(lookup.moduleBackshell("m1", "missing"), undefined);
  assert.equal(lookup.moduleStrainRelief("m1", "missing"), undefined);
});

test("createCompatLookup treats empty input as no rows", () => {
  const lookup = createCompatLookup({});
  assert.equal(lookup.contactWire("a", "b"), undefined);
  assert.equal(lookup.moduleContact("a", "b"), undefined);
  assert.equal(lookup.moduleBackshell("a", "b"), undefined);
  assert.equal(lookup.moduleStrainRelief("a", "b"), undefined);
});

test("canonical rules distinguish unknown from exhaustive exclusion and preserve direction and scopes", async () => {
  const { compatibilityStatus } = await import("./compatibility-rules.js");
  const rule = { parentPartId: "module", relationshipType: "CONTACT_ALLOWED", compatibleParts: ["OLD-PN"], targetPartIds: ["contact"], parentPositions: [], status: "allowed", isExhaustive: false };
  const input = { rules: [rule], parentPartId: "module", relationshipType: "CONTACT_ALLOWED", targetPartId: "contact", targetPartNumber: "RENAMED-PN", position: "1" };
  assert.equal(compatibilityStatus(input), "allowed");
  assert.equal(compatibilityStatus({ ...input, targetPartId: "other" }), undefined);
  assert.equal(compatibilityStatus({ ...input, targetPartId: "other", rules: [{ ...rule, isExhaustive: true }] }), "forbidden");
  assert.equal(compatibilityStatus({ ...input, parentPartId: "contact", targetPartId: "module" }), undefined);
  const forbid = { ...rule, parentPositions: ["1"], status: "forbidden" };
  assert.equal(compatibilityStatus({ ...input, rules: [rule, forbid] }), "forbidden");
  assert.equal(compatibilityStatus({ ...input, position: "2", rules: [rule, forbid] }), "allowed");
  assert.equal(compatibilityStatus({ ...input, rules: [rule, { ...forbid, status: "review" }] }), "review");
});
