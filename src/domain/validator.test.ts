import test from "node:test";
import assert from "node:assert/strict";
import type { LibraryComponentRecord } from "./library.js";
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

function libraryComponent(partial: Partial<LibraryComponentRecord> & Pick<LibraryComponentRecord, "id" | "category" | "partNumber">): LibraryComponentRecord {
  return {
    family: partial.family ?? "Generic",
    description: partial.description ?? "part",
    isActive: partial.isActive ?? true,
    isReviewed: partial.isReviewed ?? true,
    stockStatus: partial.stockStatus ?? "in_stock",
    compatibilityHints: partial.compatibilityHints ?? [],
    createdByUserId: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "seed",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    customFieldValues: partial.customFieldValues ?? {},
    awg: partial.awg,
    color: partial.color,
    ...partial
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

test("validateSnapshot allows duplicate source for one_to_many mappings", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[1] = {
    ...snapshot.connectors[1],
    pins: [
      { id: "1", number: "1" },
      { id: "2", number: "2" }
    ]
  };
  snapshot.pinMappings[0] = { ...snapshot.pinMappings[0], mappingType: "one_to_many" };
  snapshot.pinMappings.push({
    id: "m2",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "c2",
    toPinId: "2",
    mappingType: "one_to_many"
  });

  const report = validateSnapshot(snapshot);
  assert.ok(!report.results.some((r) => r.code === "RULE_PIN_MAPPING_DUPLICATE_SOURCE"));
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

test("validateSnapshot quick mode skips orphaned connector warnings", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors.push({ id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }] });

  const report = validateSnapshot(snapshot, { mode: "quick" });
  assert.ok(!report.results.some((r) => r.code === "RULE_CONNECTOR_ORPHANED"));
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
          return libraryComponent({
            id,
            category: "module",
            family: "Micro-D",
            partNumber: "MDM-15P",
            isActive: false,
            isReviewed: true,
            stockStatus: "out_of_stock"
          });
        }
        if (id === "cmp-wire-001") {
          return libraryComponent({
            id,
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-22",
            awg: "22",
            color: "white",
            isActive: true,
            isReviewed: false,
            stockStatus: "in_stock"
          });
        }
        return undefined;
      },
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_INACTIVE" && r.severity === "warning"));
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_UNREVIEWED"));
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_OUT_OF_STOCK" && r.severity === "info"));
});

test("validateSnapshot rules-2026.04 treats inactive and out-of-stock as errors", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = { ...snapshot.connectors[0], partNumber: "MDM-15P", libraryComponentId: "cmp-module-001" };

  const report = validateSnapshot(snapshot, {
    rulesetVersion: "rules-2026.04",
    libraryLookup: {
      byId(id) {
        if (id === "cmp-module-001") {
          return libraryComponent({
            id,
            category: "module",
            partNumber: "MDM-15P",
            isActive: false,
            stockStatus: "out_of_stock"
          });
        }
        return undefined;
      },
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_INACTIVE" && r.severity === "error"));
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_OUT_OF_STOCK" && r.severity === "error"));
});

test("validateSnapshot project policy can escalate inactive severity on rules-2026.03", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = { ...snapshot.connectors[0], partNumber: "MDM-15P", libraryComponentId: "cmp-module-001" };

  const report = validateSnapshot(snapshot, {
    rulesetVersion: "rules-2026.03",
    policy: { inactivePartSeverity: "error" },
    libraryLookup: {
      byId(id) {
        if (id === "cmp-module-001") {
          return libraryComponent({
            id,
            category: "module",
            partNumber: "MDM-15P",
            isActive: false
          });
        }
        return undefined;
      },
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_LIBRARY_PART_INACTIVE" && r.severity === "error"));
});

test("validateSnapshot enforces loopback mapping semantics", () => {
  const snapshot = baseSnapshot();
  snapshot.paths[0] = { ...snapshot.paths[0], toConnectorId: "c1" };
  snapshot.pinMappings[0] = {
    id: "m1",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "c1",
    toPinId: "1",
    mappingType: "one_to_one"
  };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_LOOPBACK_INVALID"));
});

test("validateSnapshot accepts valid loopback mapping", () => {
  const snapshot = baseSnapshot();
  snapshot.paths[0] = { ...snapshot.paths[0], toConnectorId: "c1" };
  snapshot.pinMappings[0] = {
    id: "m1",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "c1",
    toPinId: "1",
    mappingType: "loopback"
  };

  const report = validateSnapshot(snapshot);
  assert.ok(!report.results.some((r) => r.code === "RULE_PIN_MAPPING_LOOPBACK_INVALID"));
});

test("validateSnapshot flags incomplete connector pin coverage in full mode", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = {
    ...snapshot.connectors[0],
    pins: [
      { id: "1", number: "1" },
      { id: "2", number: "2" }
    ]
  };

  const full = validateSnapshot(snapshot, { mode: "full" });
  assert.ok(full.results.some((r) => r.code === "RULE_CONNECTOR_INCOMPLETE_MAPPING" && r.severity === "warning"));

  const quick = validateSnapshot(snapshot, { mode: "quick" });
  assert.ok(!quick.results.some((r) => r.code === "RULE_CONNECTOR_INCOMPLETE_MAPPING"));

  const strict = validateSnapshot(snapshot, { mode: "full", rulesetVersion: "rules-2026.04" });
  assert.ok(strict.results.some((r) => r.code === "RULE_CONNECTOR_INCOMPLETE_MAPPING" && r.severity === "error"));
});

test("validateSnapshot validates junction endpoint pin mappings", () => {
  const snapshot = baseSnapshot();
  snapshot.junctions = [{ id: "j1", location: { x: 0, y: 0 } }];
  snapshot.paths[0] = { ...snapshot.paths[0], toConnectorId: "j1" };
  snapshot.pinMappings[0] = {
    id: "m1",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "j1",
    toPinId: "1",
    mappingType: "one_to_one"
  };

  const report = validateSnapshot(snapshot);
  assert.ok(report.results.some((r) => r.code === "RULE_PIN_MAPPING_JUNCTION_ENDPOINT"));
});

test("validateSnapshot accepts connector-to-junction mapping with empty junction pin", () => {
  const snapshot = baseSnapshot();
  snapshot.junctions = [{ id: "j1", location: { x: 0, y: 0 } }];
  snapshot.paths[0] = { ...snapshot.paths[0], toConnectorId: "j1" };
  snapshot.pinMappings[0] = {
    id: "m1",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "j1",
    toPinId: "",
    mappingType: "one_to_one"
  };

  const report = validateSnapshot(snapshot);
  assert.ok(!report.results.some((r) => r.code === "RULE_PIN_MAPPING_JUNCTION_ENDPOINT"));
  assert.ok(!report.results.some((r) => r.code === "RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND"));
});

test("validateSnapshot checks connector pin count and pin ids against library compatibility", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = {
    ...snapshot.connectors[0],
    partNumber: "MDM-9P",
    libraryComponentId: "cmp-module-9",
    pins: [
      { id: "1", number: "1" },
      { id: "2", number: "2" }
    ]
  };
  snapshot.pinMappings.push({
    id: "m2",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "2",
    toConnectorId: "c2",
    toPinId: "1",
    mappingType: "one_to_many"
  });
  snapshot.pinMappings[0] = { ...snapshot.pinMappings[0], mappingType: "one_to_many" };

  const report = validateSnapshot(snapshot, {
    rulesetVersion: "rules-2026.04",
    libraryLookup: {
      byId(id) {
        if (id === "cmp-module-9") {
          return libraryComponent({
            id,
            category: "module",
            partNumber: "MDM-9P",
            pinCount: 9,
            pinIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
          });
        }
        return undefined;
      },
      byPartNumber: () => undefined
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_CONNECTOR_PIN_COUNT_MISMATCH"));
});

test("validateSnapshot checks wire AWG against contact and connector acceptance", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = { ...snapshot.connectors[0], partNumber: "MDM-15P", libraryComponentId: "cmp-mod" };
  snapshot.paths[0] = {
    ...snapshot.paths[0],
    wireAwg: "32",
    wirePartNumber: "W-32",
    wireComponentId: "cmp-wire",
    fromContact: "CNT-22",
    length: 12
  };

  const report = validateSnapshot(snapshot, {
    rulesetVersion: "rules-2026.04",
    libraryLookup: {
      byId(id) {
        if (id === "cmp-mod") {
          return libraryComponent({
            id,
            category: "module",
            partNumber: "MDM-15P",
            acceptedAwgMin: 20,
            acceptedAwgMax: 24,
            acceptedFamilies: ["MIL-W-22759"]
          });
        }
        if (id === "cmp-wire") {
          return libraryComponent({
            id,
            category: "wire",
            family: "Other",
            partNumber: "W-32",
            awg: "32"
          });
        }
        return undefined;
      },
      byPartNumber(partNumber) {
        if (partNumber === "CNT-22") {
          return libraryComponent({
            id: "cmp-contact",
            category: "contact",
            partNumber: "CNT-22",
            acceptedAwgMin: 20,
            acceptedAwgMax: 24
          });
        }
        return undefined;
      }
    }
  });
  assert.ok(report.results.some((r) => r.code === "RULE_WIRE_AWG_INCOMPATIBLE"));
  assert.ok(report.results.some((r) => r.code === "RULE_CONNECTOR_FAMILY_RESTRICTED"));
  assert.ok(report.results.some((r) => r.code === "RULE_WIRE_GAUGE_UNSUPPORTED"));
});

test("validateSnapshot flags unsupported path length under rules-2026.04", () => {
  const snapshot = baseSnapshot();
  snapshot.paths[0] = { ...snapshot.paths[0], length: 0 };

  const legacy = validateSnapshot(snapshot, { rulesetVersion: "rules-2026.03" });
  assert.ok(!legacy.results.some((r) => r.code === "RULE_WIRE_LENGTH_UNSUPPORTED"));

  const strict = validateSnapshot(snapshot, { rulesetVersion: "rules-2026.04" });
  assert.ok(strict.results.some((r) => r.code === "RULE_WIRE_LENGTH_UNSUPPORTED" && r.severity === "error"));
});

test("validateSnapshot ruleset version changes output deterministically", () => {
  const snapshot = baseSnapshot();
  snapshot.connectors[0] = {
    ...snapshot.connectors[0],
    pins: [
      { id: "1", number: "1" },
      { id: "2", number: "2" }
    ]
  };

  const v03 = validateSnapshot(snapshot, { rulesetVersion: "rules-2026.03" });
  const v04 = validateSnapshot(snapshot, { rulesetVersion: "rules-2026.04" });

  const incomplete03 = v03.results.find((r) => r.code === "RULE_CONNECTOR_INCOMPLETE_MAPPING");
  const incomplete04 = v04.results.find((r) => r.code === "RULE_CONNECTOR_INCOMPLETE_MAPPING");
  assert.equal(incomplete03?.severity, "warning");
  assert.equal(incomplete04?.severity, "error");
  assert.notEqual(v03.errors, v04.errors);
});
