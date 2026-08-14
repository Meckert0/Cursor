import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DesignSnapshot } from "./types.js";
import { createLibraryLookup, buildBom } from "./bom.js";
import { makePart } from "./part-test-helpers.js";
import { validateSnapshot } from "./validator.js";

async function loadFixture(fileName: string): Promise<DesignSnapshot> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(currentDir, "fixtures", fileName);
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as DesignSnapshot;
}

/** Catalog parts referenced by full-cable.complete.json */
function fullCableLibraryParts() {
  return [
    makePart({
      id: "cmp-module-001",
      category: "module",
      family: "Micro-D",
      partNumber: "MDM-15P",
      description: "15-pin module",
      attributes: {
        pinCount: 15,
        pinIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]
      }
    }),
    makePart({
      id: "cmp-wire-001",
      category: "wire",
      family: "MIL-W-22759",
      partNumber: "M22759/16-22",
      description: "22 AWG PTFE wire, white",
      attributes: { awg: "22", color: "white" }
    }),
    makePart({
      id: "cmp-label-001",
      category: "label",
      family: "Heatshrink",
      partNumber: "LBL-22",
      description: "Wire label"
    }),
    makePart({
      id: "cmp-contact-001",
      category: "contact",
      family: "Micro-D",
      partNumber: "CNT-22",
      description: "Crimp contact",
      attributes: { acceptedFamilies: [] }
    }),
    makePart({
      id: "cmp-backshell-15",
      category: "backshell",
      family: "EMI",
      partNumber: "BS-EMI-15",
      description: "EMI backshell for 15-pin Micro-D"
    }),
    makePart({
      id: "cmp-sr-15",
      category: "strain-relief",
      family: "Clamp",
      partNumber: "SR-CLAMP-15",
      description: "Strain-relief clamp for 15-pin Micro-D"
    }),
    makePart({
      id: "cmp-sleeve-exp",
      category: "sleeve-tube-braid",
      family: "expandable_sleeving",
      partNumber: "SLV-EXP-025",
      description: "Expandable PET sleeving, 0.25 in"
    })
  ];
}

test("full-cable complete fixture validates with zero errors against explicit library", async () => {
  const snapshot = await loadFixture("full-cable.complete.json");
  const lookup = createLibraryLookup(fullCableLibraryParts());
  const report = validateSnapshot(snapshot, {
    mode: "full",
    rulesetVersion: "rules-2026.03",
    libraryLookup: lookup
  });
  assert.equal(report.errors, 0);

  const bom = buildBom(
    {
      id: "rev-full-cable",
      designId: "design-full-cable",
      revisionNumber: 1,
      createdBy: "seed",
      createdAt: "2026-07-10T00:00:00.000Z",
      rulesetVersion: "rules-2026.03",
      libraryVersion: "lib-2026.03.1",
      snapshot
    },
    lookup
  );
  assert.equal(bom.summary.unresolved, 0);
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MDM-15P" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "backshell" && line.partNumber === "BS-EMI-15" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "strain-relief" && line.partNumber === "SR-CLAMP-15" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "wire" && line.partNumber === "M22759/16-22" && line.quantity === 12));
  assert.ok(bom.lines.some((line) => line.category === "contact" && line.partNumber === "CNT-22" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "label" && line.partNumber === "LBL-22" && line.quantity === 1));
  assert.ok(
    bom.lines.some((line) => line.category === "sleeve-tube-braid" && line.partNumber === "SLV-EXP-025" && line.quantity === 12)
  );
});

test("known-good fixture returns zero errors and warnings", async () => {
  const snapshot = await loadFixture("known-good.basic.json");
  const report = validateSnapshot(snapshot);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.results.length, 0);
});

test("known-bad fixture returns expected validation rule hits", async () => {
  const snapshot = await loadFixture("known-bad.multiple-errors.json");
  const report = validateSnapshot(snapshot);
  const codes = new Set(report.results.map((result) => result.code));

  assert.ok(codes.has("RULE_PATH_CONNECTOR_NOT_FOUND"));
  assert.ok(codes.has("RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND"));
  assert.ok(codes.has("RULE_PIN_MAPPING_INCOMPLETE"));
  assert.ok(codes.has("RULE_PIN_MAPPING_INVALID_PATH"));
  assert.ok(codes.has("RULE_PIN_MAPPING_DUPLICATE_SOURCE"));
  assert.ok(codes.has("RULE_PIN_MAPPING_ENDPOINT_MISMATCH"));
  assert.ok(codes.has("RULE_BUNDLE_PATH_NOT_FOUND"));
  assert.ok(codes.has("RULE_CONNECTOR_ORPHANED"));
});

test("known-bad compatibility fixture hits electrical and manufacturability rules under rules-2026.04", async () => {
  const snapshot = await loadFixture("known-bad.compatibility.json");
  const lookup = createLibraryLookup([
    makePart({
      id: "cmp-module-9",
      category: "module",
      family: "Micro-D",
      partNumber: "MDM-9P",
      description: "9-pin module",
      attributes: {
        pinCount: 9,
        pinIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
      }
    }),
    makePart({
      id: "cmp-wire-32",
      category: "wire",
      family: "Other",
      partNumber: "W-32",
      description: "unsupported gauge wire",
      attributes: { awg: "32", color: "white" }
    }),
    makePart({
      id: "cmp-contact-22",
      category: "contact",
      family: "Micro-D",
      partNumber: "CNT-22",
      description: "contact",
      attributes: {
        acceptedFamilies: [],
        acceptedAwgMin: 20,
        acceptedAwgMax: 24
      }
    })
  ]);

  const report = validateSnapshot(snapshot, {
    rulesetVersion: "rules-2026.04",
    mode: "full",
    libraryLookup: lookup
  });
  const codes = new Set(report.results.map((result) => result.code));

  assert.ok(codes.has("RULE_CONNECTOR_PIN_COUNT_MISMATCH"));
  assert.ok(codes.has("RULE_CONNECTOR_PIN_ID_UNKNOWN"));
  assert.ok(codes.has("RULE_PIN_MAPPING_JUNCTION_ENDPOINT"));
  assert.ok(codes.has("RULE_PIN_MAPPING_LOOPBACK_INVALID"));
  assert.ok(codes.has("RULE_WIRE_AWG_INCOMPATIBLE"));
  // Modules no longer carry acceptedFamilies — family restriction does not fire for module connectors.
  assert.ok(!codes.has("RULE_CONNECTOR_FAMILY_RESTRICTED"));
  assert.ok(codes.has("RULE_WIRE_GAUGE_UNSUPPORTED"));
  assert.ok(codes.has("RULE_WIRE_LENGTH_UNSUPPORTED"));
  assert.ok(codes.has("RULE_CONNECTOR_INCOMPLETE_MAPPING"));
  assert.ok(report.errors > 0);
});
