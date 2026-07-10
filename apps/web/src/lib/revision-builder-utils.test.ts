import { describe, expect, it } from "vitest";
import {
  buildClientValidationIssues,
  buildSnapshotFromRows,
  convertSnapshotToRows,
  sanitizeConnectorLocations,
  summarizeSnapshotDiff
} from "./revision-builder-utils";

describe("revision-builder-utils", () => {
  it("converts snapshot with multi-pin connectors into rows", () => {
    const converted = convertSnapshotToRows({
      connectors: [
        {
          id: "c1",
          reference: "J1",
          location: { x: 100, y: 200 },
          pins: [
            { id: "1", number: "1" },
            { id: "2", number: "2" }
          ]
        }
      ],
      paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "c1", pathType: "wire" }],
      pinMappings: [
        {
          id: "m1",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c1",
          toPinId: "2",
          mappingType: "one_to_one"
        }
      ],
      bundles: [{ id: "b1", name: "Main", pathIds: ["p1"] }],
      annotations: [{ id: "a1", text: "note" }]
    });

    expect(converted.connectors).toHaveLength(2);
    expect(converted.connectors[0].id).toBe("c1");
    expect(converted.bundles[0].pathIds).toBe("p1");
    expect(converted.connectorLocations.c1).toEqual({ x: 100, y: 200 });
  });

  it("detects validation issues for missing references", () => {
    const issues = buildClientValidationIssues({
      connectors: [{ id: "c1", reference: "J1", pinId: "1", pinNumber: "1" }],
      junctions: [],
      paths: [
        {
          id: "p1",
          wireName: "wire1",
          fromConnectorId: "c1",
          toConnectorId: "missing",
          pathType: "wire",
          length: "",
          sleeving: "none",
          wireComponentId: ""
        }
      ],
      mappings: [],
      bundles: [],
      annotations: []
    });
    expect(issues.some((issue) => issue.includes('references missing to node "missing"'))).toBe(true);
    expect(issues.some((issue) => issue.includes("At least one pin mapping is required."))).toBe(true);
  });

  it("injects default path and mapping rows for empty snapshots", () => {
    const converted = convertSnapshotToRows({
      connectors: [{ id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] }],
      paths: [],
      pinMappings: [],
      bundles: [],
      annotations: []
    });
    expect(converted.paths).toHaveLength(1);
    expect(converted.mappings).toHaveLength(1);
  });

  it("summarizes snapshot diff by entity IDs", () => {
    const base = buildSnapshotFromRows({
      connectors: [{ id: "c1", reference: "J1", pinId: "1", pinNumber: "1" }],
      junctions: [],
      paths: [
        {
          id: "p1",
          wireName: "wire1",
          fromConnectorId: "c1",
          toConnectorId: "c1",
          pathType: "wire",
          length: "",
          sleeving: "none",
          wireComponentId: ""
        }
      ],
      mappings: [
        {
          id: "m1",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c1",
          toPinId: "1",
          mappingType: "one_to_one"
        }
      ],
      bundles: [],
      annotations: []
    });

    const current = buildSnapshotFromRows({
      connectors: [
        { id: "c1", reference: "J1-UPDATED", pinId: "1", pinNumber: "1" },
        { id: "c2", reference: "J2", pinId: "1", pinNumber: "1" }
      ],
      junctions: [],
      paths: [
        {
          id: "p2",
          wireName: "wire2",
          fromConnectorId: "c1",
          toConnectorId: "c2",
          pathType: "wire",
          length: "",
          sleeving: "none",
          wireComponentId: ""
        }
      ],
      mappings: [
        {
          id: "m1",
          pathId: "p2",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c2",
          toPinId: "1",
          mappingType: "one_to_one"
        }
      ],
      bundles: [],
      annotations: []
    });

    const diff = summarizeSnapshotDiff(base, current);
    expect(diff.connectors.added).toEqual(["c2"]);
    expect(diff.connectors.changed).toEqual(["c1"]);
    expect(diff.paths.removed).toEqual(["p1"]);
    expect(diff.paths.added).toEqual(["p2"]);
  });

  it("preserves connector locations when rebuilding snapshot", () => {
    const snapshot = buildSnapshotFromRows(
      {
        connectors: [{ id: "c1", reference: "J1", pinId: "1", pinNumber: "1" }],
        junctions: [],
        paths: [],
        mappings: [],
        bundles: [],
        annotations: []
      },
      { c1: { x: 220, y: 140 } }
    );

    expect(snapshot.connectors[0]?.location).toEqual({ x: 220, y: 140 });
  });

  it("filters connector locations to valid connector ids", () => {
    const cleaned = sanitizeConnectorLocations(
      [{ id: "c1", reference: "J1", pinId: "1", pinNumber: "1" }],
      {
        c1: { x: 10, y: 20 },
        stale: { x: 999, y: 999 }
      }
    );
    expect(cleaned).toEqual({ c1: { x: 10, y: 20 } });
  });

  it("preserves path length and sleeving fields", () => {
    const snapshot = buildSnapshotFromRows({
      connectors: [
        { id: "c1", reference: "J1", pinId: "1", pinNumber: "1" },
        { id: "c2", reference: "J2", pinId: "1", pinNumber: "1" }
      ],
      junctions: [],
      paths: [
        {
          id: "p1",
          wireName: "wire1",
          fromConnectorId: "c1",
          toConnectorId: "c2",
          pathType: "wire",
          length: "2.5",
          sleeving: "expandable_sleeving",
          wireComponentId: "cmp-wire-001"
        }
      ],
      mappings: [
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
    });
    expect(snapshot.paths[0]?.length).toBe(2.5);
    expect(snapshot.paths[0]?.sleeving).toBe("expandable_sleeving");

    const converted = convertSnapshotToRows(snapshot);
    expect(converted.paths[0]?.length).toBe("2.5");
    expect(converted.paths[0]?.sleeving).toBe("expandable_sleeving");
    expect(converted.paths[0]?.wireComponentId).toBe("cmp-wire-001");
  });
});
