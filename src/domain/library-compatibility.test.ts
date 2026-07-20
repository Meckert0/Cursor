import test from "node:test";
import assert from "node:assert/strict";
import {
  awgInAcceptedRange,
  familyAccepted,
  parseWireAwg,
  promoteCompatibilityFields,
  resolveLibraryCompatibility
} from "./library-compatibility.js";
import { resolveLibraryLifecycleStatus, type LibraryComponentRecord } from "./library.js";
import { resolveRule } from "./ruleset-definitions.js";

function component(partial: Partial<LibraryComponentRecord> = {}): LibraryComponentRecord {
  return {
    id: "cmp-1",
    category: "module",
    family: "Micro-D",
    partNumber: "MDM-9P",
    description: "module",
    isActive: true,
    isReviewed: true,
    stockStatus: "in_stock",
    compatibilityHints: [],
    createdByUserId: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "seed",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    customFieldValues: {},
    ...partial
  };
}

test("resolveLibraryCompatibility reads first-class columns only", () => {
  const resolved = resolveLibraryCompatibility(
    component({
      pinCount: 9,
      pinIds: ["1", "2", "3"],
      acceptedAwgMin: 20,
      acceptedAwgMax: 24,
      acceptedFamilies: ["MIL-W-22759", "Other"],
      customFieldValues: {
        pinCount: "99",
        acceptedAwgMin: "10"
      }
    })
  );
  assert.deepEqual(resolved, {
    pinCount: 9,
    pinIds: ["1", "2", "3"],
    acceptedAwgMin: 20,
    acceptedAwgMax: 24,
    acceptedFamilies: ["MIL-W-22759", "Other"]
  });
});

test("promoteCompatibilityFields lifts legacy customFieldValues into first-class fields", () => {
  const promoted = promoteCompatibilityFields({
    category: "module" as const,
    family: "Micro-D",
    partNumber: "MDM-9P",
    description: "module",
    isActive: true,
    stockStatus: "in_stock" as const,
    compatibilityHints: [],
    isReviewed: false,
    customFieldValues: {
      pinCount: "9",
      pinIds: "1,2,3",
      acceptedAwgMin: "20",
      acceptedAwgMax: "24",
      acceptedFamilies: "MIL-W-22759; Other"
    }
  });
  assert.equal(promoted.pinCount, 9);
  assert.deepEqual(promoted.pinIds, ["1", "2", "3"]);
  assert.equal(promoted.acceptedAwgMin, 20);
  assert.equal(promoted.acceptedAwgMax, 24);
  assert.deepEqual(promoted.acceptedFamilies, ["MIL-W-22759", "Other"]);
});

test("parseWireAwg and range helpers", () => {
  assert.equal(parseWireAwg("22 AWG"), 22);
  assert.equal(awgInAcceptedRange(22, { acceptedAwgMin: 20, acceptedAwgMax: 24 }), true);
  assert.equal(awgInAcceptedRange(28, { acceptedAwgMin: 20, acceptedAwgMax: 24 }), false);
  assert.equal(familyAccepted("MIL-W-22759", ["mil-w-22759"]), true);
  assert.equal(familyAccepted("Other", ["MIL-W-22759"]), false);
});

test("resolveLibraryLifecycleStatus maps draft/reviewed/inactive/archived", () => {
  assert.equal(resolveLibraryLifecycleStatus({ isReviewed: false, isActive: true }), "draft");
  assert.equal(resolveLibraryLifecycleStatus({ isReviewed: true, isActive: true }), "reviewed_active");
  assert.equal(resolveLibraryLifecycleStatus({ isReviewed: true, isActive: false }), "inactive");
  assert.equal(resolveLibraryLifecycleStatus({ isReviewed: true, isActive: true, isArchived: true }), "archived");
});

test("resolveRule gates by mode and ruleset version", () => {
  const orphanQuick = resolveRule("rules-2026.03", "RULE_CONNECTOR_ORPHANED", "quick");
  const orphanFull = resolveRule("rules-2026.03", "RULE_CONNECTOR_ORPHANED", "full");
  assert.equal(orphanQuick.enabled, false);
  assert.equal(orphanFull.enabled, true);

  const awgLegacy = resolveRule("rules-2026.03", "RULE_WIRE_AWG_INCOMPATIBLE", "full");
  const awgStrict = resolveRule("rules-2026.04", "RULE_WIRE_AWG_INCOMPATIBLE", "full");
  assert.equal(awgLegacy.enabled, false);
  assert.equal(awgStrict.enabled, true);
  assert.equal(awgStrict.severity, "error");

  const inactive = resolveRule("rules-2026.03", "RULE_LIBRARY_PART_INACTIVE", "full", {
    inactivePartSeverity: "error"
  });
  assert.equal(inactive.severity, "error");

  const unreviewed = resolveRule("rules-2026.03", "RULE_LIBRARY_PART_UNREVIEWED", "full", {
    unreviewedPartSeverity: "error"
  });
  assert.equal(unreviewed.severity, "error");
});
