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
