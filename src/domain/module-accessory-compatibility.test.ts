import assert from "node:assert/strict";
import test from "node:test";
import type { CompatibilityRule } from "./compatibility-rules.js";
import { moduleAccessoryStatus } from "./module-accessory-compatibility.js";

const module = { id: "module", category: "module", family: "iSeries", description: "160-position module", attributes: { positionCount: 160 } };
const strainRelief = { id: "sr-102", category: "strain-relief", partNumber: "310123102" };
const rule: CompatibilityRule = {
  parentPartId: module.id, relationshipType: "STRAIN_RELIEF_ALLOWED", parentPositions: [],
  compatibleParts: ["310123101", "310123102"], targetPartIds: ["sr-101", "sr-102"], status: "allowed"
};

test("grouped and legacy accessory relationships use canonical IDs and part-number fallback", () => {
  assert.equal(moduleAccessoryStatus(module, strainRelief, [rule]), "allowed");
  assert.equal(moduleAccessoryStatus(module, { ...strainRelief, id: "sr-101", partNumber: "310123101" }, [rule]), "allowed");
  assert.equal(moduleAccessoryStatus(module, strainRelief, [{ ...rule, targetPartIds: [strainRelief.id], isExhaustive: false }]), "allowed");
  assert.equal(moduleAccessoryStatus(module, strainRelief, [{ ...rule, targetPartIds: undefined }]), "allowed");
  assert.equal(moduleAccessoryStatus(module, { ...strainRelief, id: "different-id" }, [rule]), "forbidden");
  assert.equal(moduleAccessoryStatus(module, strainRelief, [{ ...rule, parentPartId: "another-module" }]), undefined);
  assert.equal(moduleAccessoryStatus(module, strainRelief, [{ ...rule, parentPositions: ["1"] }]), undefined);
  assert.equal(moduleAccessoryStatus(module, strainRelief, []), undefined);
  assert.equal(moduleAccessoryStatus(module, { ...strainRelief, category: "backshell" }, [rule]), undefined);
  assert.equal(moduleAccessoryStatus(module, { ...strainRelief, category: "backshell" }, [{ ...rule, relationshipType: "BACKSHELL_ALLOWED" }]), "allowed");
});

test("forbidden and review rows override allowances independently of database row order", () => {
  for (const status of ["review", "forbidden"] as const) {
    const restriction = { ...rule, status };
    assert.equal(moduleAccessoryStatus(module, strainRelief, [rule, restriction]), status);
    assert.equal(moduleAccessoryStatus(module, strainRelief, [restriction, rule]), status);
  }
  assert.equal(moduleAccessoryStatus(module, strainRelief, [{ ...rule, status: "review" }, rule, { ...rule, status: "forbidden" }]), "forbidden");
});

test("all blank fillers reject strain reliefs even when catalog rows allow them", () => {
  for (const blank of [
    { ...module, description: "Blank module", attributes: {} },
    { ...module, family: "Blank insert", description: "Filler", attributes: { positionCount: 0 } },
    { ...module, description: "Blanking module", attributes: { pinCount: 0 } },
    { ...module, description: "Module", attributes: { contactFamily1: "BLANK" } }
  ]) {
    for (const rules of [[], [rule], [{ ...rule, targetPartIds: undefined }]]) {
      assert.equal(moduleAccessoryStatus(blank, strainRelief, rules), "forbidden");
    }
  }
  const host = { ...module, description: "Blank SIM host", electricalMode: "INSERT_HOST", attributes: { simSlotCount: 4 } };
  assert.equal(moduleAccessoryStatus(host, strainRelief, [rule]), "allowed");
});
