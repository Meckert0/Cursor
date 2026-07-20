import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "./api";
import {
  buildConnectorPairTotals,
  buildConnectorPins,
  buildDefaultPositions,
  buildSnapshotFromCanvas,
  buildUniqueWireSections,
  formatConnectorPinsLabel,
  normalizePathEndpointSelection,
  normalizeSelectedPathId,
  normalizeUnassignedConnectors,
  parsePinCount,
  readPinCountFromComponent,
  removeConnectorAndRelatedPaths
} from "./cable-canvas-utils";
import { buildNextCanvasId, buildNextConnectorReference, buildNextWireName } from "./cable-canvas-ids";

function hashCanvasSnapshot(snapshot: RevisionDto["snapshot"]): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

describe("cable-canvas-utils", () => {
  it("parses pin count values", () => {
    expect(parsePinCount("12")).toBe(12);
    expect(parsePinCount(" 4 ")).toBe(4);
    expect(parsePinCount("")).toBeNull();
    expect(parsePinCount("0")).toBeNull();
    expect(parsePinCount("-3")).toBeNull();
    expect(parsePinCount("abc")).toBeNull();
    expect(parsePinCount("3.5")).toBeNull();
  });

  it("builds connector pins from count", () => {
    expect(buildConnectorPins(0)).toEqual([]);
    expect(buildConnectorPins(1)).toEqual([{ id: "1", number: "1" }]);
    expect(buildConnectorPins(3)).toEqual([
      { id: "1", number: "1" },
      { id: "2", number: "2" },
      { id: "3", number: "3" }
    ]);
  });

  it("reads pinCount from first-class field and legacy customFieldValues", () => {
    expect(
      readPinCountFromComponent({
        pinCount: 15,
        customFieldValues: { pincount: "8" }
      } as LibraryComponentDto)
    ).toBe(15);
    const component = {
      customFieldValues: { pincount: "8" }
    } as LibraryComponentDto;
    expect(readPinCountFromComponent(component)).toBe(8);
    expect(readPinCountFromComponent({ customFieldValues: {} } as LibraryComponentDto)).toBeNull();
  });

  it("formats connector pin labels", () => {
    expect(formatConnectorPinsLabel({ id: "c1", reference: "J1", pins: [] })).toBe("none");
    expect(
      formatConnectorPinsLabel({
        id: "c1",
        reference: "J1",
        partNumber: "ABC-123",
        pins: []
      })
    ).toBe("none");
    expect(
      formatConnectorPinsLabel({
        id: "c1",
        reference: "J1",
        partNumber: "ABC-123",
        pins: [{ id: "1", number: "1" }]
      })
    ).toBe("1 pin available");
    expect(
      formatConnectorPinsLabel({
        id: "c1",
        reference: "J1",
        partNumber: "ABC-123",
        pins: [
          { id: "1", number: "1" },
          { id: "2", number: "2" }
        ]
      })
    ).toBe("2 pins available");
  });

  it("normalizes unassigned connectors to empty pins", () => {
    const result = normalizeUnassignedConnectors([
      { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
      {
        id: "c2",
        reference: "J2",
        partNumber: "PART-1",
        pins: [{ id: "1", number: "1" }, { id: "2", number: "2" }]
      }
    ]);
    expect(result[0]?.pins).toEqual([]);
    expect(result[1]?.pins).toHaveLength(2);
  });

  it("normalizes path endpoints when selected ids are missing", () => {
    const result = normalizePathEndpointSelection(
      [
        { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
        { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
      ],
      "missing",
      "missing"
    );
    expect(result).toEqual({ fromId: "c1", toId: "c2" });
  });

  it("removes connector, related paths, and stale positions", () => {
    const result = removeConnectorAndRelatedPaths({
      connectorId: "c2",
      connectors: [
        { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
        { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] },
        { id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }] }
      ],
      paths: [
        { id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire" },
        { id: "p2", fromConnectorId: "c1", toConnectorId: "c3", pathType: "wire" }
      ],
      positions: {
        c1: { x: 10, y: 20 },
        c2: { x: 30, y: 40 },
        c3: { x: 50, y: 60 }
      },
      currentFromId: "c2",
      currentToId: "c3",
      currentSelectedConnectorId: "c2",
      currentSelectedPathId: "p1"
    });

    expect(result.connectors.map((connector) => connector.id)).toEqual(["c1", "c3"]);
    expect(result.paths.map((path) => path.id)).toEqual(["p2"]);
    expect(result.positions).toEqual({
      c1: { x: 10, y: 20 },
      c3: { x: 50, y: 60 }
    });
    expect(result.nextFromId).toBe("c1");
    expect(result.nextToId).toBe("c3");
    expect(result.nextSelectedConnectorId).toBe("c1");
    expect(result.nextSelectedPathId).toBe("p2");
  });

  it("normalizes selected path id when path disappears", () => {
    const result = normalizeSelectedPathId(
      [
        { id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire" },
        { id: "p2", fromConnectorId: "c1", toConnectorId: "c3", pathType: "wire" }
      ],
      "missing"
    );
    expect(result).toBe("p1");
  });

  it("builds unique wire sections with normalized defaults", () => {
    const sections = buildUniqueWireSections([
      {
        id: "p2",
        fromConnectorId: "c2",
        toConnectorId: "j1",
        pathType: "wire",
        wireName: "wire2",
        sleeving: "expandable_sleeving"
      },
      {
        id: "p1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "wire",
        length: 3.5
      }
    ]);

    expect(sections).toEqual([
      {
        pathId: "p1",
        wireName: "p1",
        fromNodeId: "c1",
        toNodeId: "c2",
        lengthFt: 3.5,
        sleeving: "none",
        wireComponentId: undefined
      },
      {
        pathId: "p2",
        wireName: "wire2",
        fromNodeId: "c2",
        toNodeId: "j1",
        lengthFt: 0,
        sleeving: "expandable_sleeving",
        wireComponentId: undefined
      }
    ]);
  });

  it("builds connector pair totals through junction paths", () => {
    const totals = buildConnectorPairTotals({
      connectors: [
        { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
        { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] },
        { id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }] }
      ],
      junctions: [{ id: "j1", location: { x: 0, y: 0 }, junctionType: "splice" }],
      paths: [
        { id: "p1", fromConnectorId: "c1", toConnectorId: "j1", pathType: "wire", length: 2 },
        { id: "p2", fromConnectorId: "j1", toConnectorId: "c2", pathType: "wire", length: 1.5 },
        { id: "p3", fromConnectorId: "c2", toConnectorId: "c3", pathType: "wire", length: 4 }
      ]
    });

    expect(totals).toEqual([
      { fromConnectorId: "c1", toConnectorId: "c2", totalLengthFt: 3.5, hopCount: 2 },
      { fromConnectorId: "c1", toConnectorId: "c3", totalLengthFt: 7.5, hopCount: 3 },
      { fromConnectorId: "c2", toConnectorId: "c3", totalLengthFt: 4, hopCount: 1 }
    ]);
  });

  it("builds next canvas ids, wire names, and connector references", () => {
    expect(buildNextCanvasId(["c_canvas_1"], "c_canvas_")).toBe("c_canvas_2");
    expect(buildNextWireName([{ id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire", wireName: "wire3" }])).toBe(
      "wire4"
    );
    expect(buildNextConnectorReference([{ id: "c1", reference: "J1", pins: [] }])).toBe("J2");
  });

  it("round-trips canvas edits into a hash-stable revision snapshot", () => {
    const baseline: RevisionDto["snapshot"] = {
      connectors: [{ id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] }],
      junctions: [{ id: "j1", location: { x: 10, y: 20 }, junctionType: "splice", label: "A" }],
      paths: [
        {
          id: "p1",
          fromConnectorId: "c1",
          toConnectorId: "j1",
          pathType: "wire",
          wireName: "wire1",
          length: 12,
          sleeving: "none"
        }
      ],
      pinMappings: [
        {
          id: "m1",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c1",
          toPinId: "1",
          mappingType: "one_to_one"
        },
        {
          id: "m-stale",
          pathId: "missing",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c2",
          toPinId: "1",
          mappingType: "one_to_one"
        }
      ],
      bundles: [
        { id: "b1", name: "bundle", pathIds: ["p1", "gone"] },
        { id: "b2", name: "empty", pathIds: ["gone"] }
      ],
      annotations: [{ id: "a1", text: "note" }]
    };

    const connectors = [
      ...baseline.connectors,
      { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }], partNumber: "CONN-2" }
    ];
    const junctions = baseline.junctions ?? [];
    const paths = [
      ...baseline.paths,
      {
        id: "p2",
        fromConnectorId: "c2",
        toConnectorId: "j1",
        pathType: "wire",
        wireName: "wire2",
        length: 8,
        sleeving: "expandable_sleeving" as const
      }
    ];
    const positions = {
      c1: { x: 40, y: 50 },
      c2: { x: 220, y: 80 },
      j1: { x: 130, y: 140 }
    };

    const first = buildSnapshotFromCanvas(baseline, { connectors, junctions, paths, positions });
    expect(first.connectors.map((connector) => connector.location)).toEqual([
      { x: 40, y: 50 },
      { x: 220, y: 80 }
    ]);
    expect(first.junctions?.[0]?.location).toEqual({ x: 130, y: 140 });
    expect(first.pinMappings.map((mapping) => mapping.id)).toEqual(["m1"]);
    expect(first.bundles[0]?.pathIds).toEqual(["p1"]);
    expect(first.annotations).toEqual(baseline.annotations);

    const rebuiltPositions = buildDefaultPositions(first.connectors, first.junctions ?? []);
    const second = buildSnapshotFromCanvas(first, {
      connectors: first.connectors,
      junctions: first.junctions ?? [],
      paths: first.paths,
      positions: rebuiltPositions
    });
    expect(hashCanvasSnapshot(second)).toBe(hashCanvasSnapshot(first));
  });
});
