import test from "node:test";
import assert from "node:assert/strict";
import type { DesignSnapshot } from "./types.js";
import { validateSnapshot } from "./validator.js";

function baseSnapshot(): DesignSnapshot {
  return {
    connectors: [
      { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
      { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
    ],
    paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire" }],
    pinMappings: [
      {
        id: "m1",
        pathId: "p1",
        fromConnectorId: "c1",
        fromPinId: "1",
        toConnectorId: "c2",
        toPinId: "1",
        mappingType: "one_to_one"
      }
    ],
    bundles: [],
    annotations: []
  };
}

test("validateSnapshot returns no issues for valid topology", () => {
  const report = validateSnapshot(baseSnapshot());
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.results.length, 0);
});

test("validateSnapshot flags missing path connector", () => {
  const snapshot = baseSnapshot();
  snapshot.paths[0] = { ...snapshot.paths[0], toConnectorId: "missing" };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PATH_CONNECTOR_NOT_FOUND"));
});

test("validateSnapshot flags mapping with unknown path", () => {
  const snapshot = baseSnapshot();
  snapshot.pinMappings[0] = { ...snapshot.pinMappings[0], pathId: "missing-path" };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_INVALID_PATH"));
});

test("validateSnapshot flags mapping with missing connector", () => {
  const snapshot = baseSnapshot();
  snapshot.pinMappings[0] = { ...snapshot.pinMappings[0], toConnectorId: "missing-connector" };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND"));
});

test("validateSnapshot flags missing source pin and destination pin", () => {
  const snapshot = baseSnapshot();
  snapshot.pinMappings[0] = { ...snapshot.pinMappings[0], fromPinId: "9", toPinId: "8" };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_SOURCE_PIN_NOT_FOUND"));
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND"));
});

test("validateSnapshot flags duplicate source mapping for same path", () => {
  const snapshot = baseSnapshot();
  snapshot.pinMappings.push({
    ...snapshot.pinMappings[0],
    id: "m2"
  });

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_DUPLICATE_SOURCE"));
});

test("validateSnapshot flags bundle with missing path", () => {
  const snapshot = baseSnapshot();
  snapshot.bundles.push({ id: "b1", name: "bundle", pathIds: ["p1", "missing-path"] });

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_BUNDLE_PATH_NOT_FOUND"));
});

test("validateSnapshot warns when connector is orphaned", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors.push({ id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }] });

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_CONNECTOR_ORPHANED" && r.severity === "warning"));
});

test("validateSnapshot flags missing library parts when lookup is provided", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = { ...snapshot.connectors[0], partNumber: "MISSING-CONN" };
  snapshot.paths[0] = { ...snapshot.paths[0], wirePartNumber: "MISSING-WIRE" };

  const report = validateSnapshot(snapshot, {
    libraryLookup: {
      byId: () => undefined,
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_NOT_FOUND" && r.entityType === "connector"));
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_NOT_FOUND" && r.entityType === "path"));
});

test("validateSnapshot warns for inactive and unreviewed library parts", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = { ...snapshot.connectors[0], partNumber: "MDM-15P", libraryComponentId: "cmp-module-001" };
  snapshot.paths[0] = { ...snapshot.paths[0], wirePartNumber: "M22759/16-22", wireComponentId: "cmp-wire-001" };

  const report = validateSnapshot(snapshot, {
    libraryLookup: {
      byId(id) {
        if (id === "cmp-module-001") {
          return {
            id,
            category: "module",
            family: "Micro-D",
            partNumber: "MDM-15P",
            description: "module",
            isActive: false,
            isReviewed: true,
            stockStatus: "out_of_stock",
            compatibilityHints: [],
            createdByUserId: "seed",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastEditedByUserId: "seed",
            lastEditedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            customFieldValues: {}
          };
        }
        if (id === "cmp-wire-001") {
          return {
            id,
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-22",
            description: "wire",
            awg: "22",
            color: "white",
            isActive: true,
            isReviewed: false,
            stockStatus: "in_stock",
            compatibilityHints: [],
            createdByUserId: "seed",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastEditedByUserId: "seed",
            lastEditedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            customFieldValues: {}
          };
        }
        return undefined;
      },
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_INACTIVE"));
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_UNREVIEWED"));
});
