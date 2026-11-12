import assert from "node:assert/strict";
import test from "node:test";
import { pruneBlankStrainReliefTargets } from "./blank-strain-relief-compatibility.js";
import { makePart } from "./part-test-helpers.js";

const relief = makePart({ id: "sr", category: "strain-relief", partNumber: "310123102", family: "iSeries", description: "Strain relief" });
const modulePart = makePart({ id: "module", category: "module", partNumber: "510160101", family: "iSeries", description: "Module", attributes: { pinIds: ["1"] } });
const blank = makePart({ id: "blank", category: "module", partNumber: "BLANK-1", family: "iSeries", description: "Blank module", electricalMode: "NONE", attributes: { positionCount: 160, pinIds: [] } });
const frame = makePart({ id: "frame", category: "frame", partNumber: "FRAME", family: "iSeries", description: "Frame" });
const parts = [relief, modulePart, blank, frame];

test("prunes only blank strain-relief links and preserves group identity and metadata", () => {
  const row = { id: "group", parentPartId: relief.id, targetPartIds: [blank.id, modulePart.id], compatibleParts: ["STALE-BLANK", "STALE-MODULE"],
    unresolvedParts: [" blank-1 ", "UNKNOWN"], status: "review", source: "manufacturer", notes: "Original notes", parentPositions: ["A"], isExhaustive: true, extra: { revision: "B" } };
  const before = structuredClone(row);
  const result = pruneBlankStrainReliefTargets(row, parts);
  assert.deepEqual(result.row, { ...row, targetPartIds: [modulePart.id], compatibleParts: ["STALE-MODULE"], unresolvedParts: ["UNKNOWN"] });
  assert.deepEqual(result.removedTargetIds, [blank.id]);
  assert.deepEqual(result.removedUnresolved, [" blank-1 "]);
  assert.equal(result.empty, false);
  assert.deepEqual(row, before);
  assert.equal(pruneBlankStrainReliefTargets(result.row, parts).row, result.row);
});

test("identifies empty invalid groups in both directions and accepts PN-only source data", () => {
  const reverse = { parentPartId: blank.id, compatibleParts: [relief.partNumber] };
  assert.equal(pruneBlankStrainReliefTargets(reverse, parts).empty, true);
  const mixed = { parentPartId: relief.id, compatibleParts: [" blank-1 ", modulePart.partNumber] };
  assert.deepEqual(pruneBlankStrainReliefTargets(mixed, parts).row.compatibleParts, [modulePart.partNumber]);
});

test("preserves frame-to-blank fits, empty profiles and unknown or ambiguous targets", () => {
  const frameRow = { parentPartId: frame.id, targetPartIds: [blank.id], compatibleParts: [blank.partNumber] };
  assert.equal(pruneBlankStrainReliefTargets(frameRow, parts).row, frameRow);
  const empty = { parentPartId: blank.id, targetPartIds: [], compatibleParts: [] };
  assert.equal(pruneBlankStrainReliefTargets(empty, parts).empty, false);
  const ambiguous = { parentPartId: relief.id, compatibleParts: [blank.partNumber, "UNKNOWN"] };
  assert.equal(pruneBlankStrainReliefTargets(ambiguous, [...parts, { ...modulePart, partNumber: blank.partNumber }]).row, ambiguous);
});
