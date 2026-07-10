import { describe, expect, it } from "vitest";
import type { LibraryComponentDto } from "./api";
import {
  buildConnectorPairTotals,
  buildConnectorPins,
  buildUniqueWireSections,
  formatConnectorPinsLabel,
  normalizePathEndpointSelection,
  normalizeSelectedPathId,
  normalizeUnassignedConnectors,
  parsePinCount,
  readPinCountFromComponent,
  removeConnectorAndRelatedPaths
} from "./cable-canvas-utils";

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

  it("reads pincount from library components", () => {
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
      junctions: [{ id: "j1", junctionType: "splice" }],
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
});
