import { describe, expect, it } from "vitest";
import type { RevisionDto } from "./api";
import { bundleDiameterInches } from "./cable-canvas-utils";
import {
  cableSectionBundleDiameters,
  cableSectionIdsBetween,
  lookupWireOverallDiameterIn,
  selectSleeveForBundleDiameter
} from "./bundle-diameter";

type Snapshot = RevisionDto["snapshot"];

function connector(id: string, reference: string): Snapshot["connectors"][number] {
  return {
    id,
    reference,
    pins: [{ id: "1", number: "1" }]
  };
}

function cable(
  id: string,
  fromConnectorId: string,
  toConnectorId: string,
  length: number
): Snapshot["paths"][number] {
  return {
    id,
    fromConnectorId,
    toConnectorId,
    pathType: "cable",
    wireName: id,
    length,
    sleeving: "expandable_sleeving"
  };
}

function wire(input: {
  id: string;
  fromConnectorId: string;
  toConnectorId: string;
  wireComponentId?: string;
  wirePartNumber?: string;
  fromLocation?: string;
  toLocation?: string;
}): Snapshot["paths"][number] {
  return {
    id: input.id,
    fromConnectorId: input.fromConnectorId,
    toConnectorId: input.toConnectorId,
    pathType: "wire",
    wirelistManaged: true,
    wireName: input.id,
    wireComponentId: input.wireComponentId,
    wirePartNumber: input.wirePartNumber,
    fromLocation: input.fromLocation,
    toLocation: input.toLocation
  };
}

const wireCatalog = [
  { id: "w-22", category: "wire", partNumber: "M22759/16-22", attributes: { overallDia: 0.05, awg: "22", color: "white" } },
  { id: "w-16", category: "wire", partNumber: "M22759/16-16", attributes: { overallDia: 0.08, awg: "16", color: "black" } },
  { id: "w-blank", category: "wire", partNumber: "NO-DIA", attributes: { awg: "20", color: "red" } }
];

describe("cable section bundle diameters", () => {
  const connectors = [connector("c1", "J1"), connector("c2", "J2"), connector("c3", "J3")];
  const junctions = [{ id: "jx", location: { x: 10, y: 10 }, label: "JX" }];
  const cablePaths = [cable("p-trunk", "c1", "jx", 12), cable("p-j2", "jx", "c2", 6), cable("p-j3", "jx", "c3", 8)];

  it("counts each wirelist wire on every section between its endpoints", () => {
    const diameters = cableSectionBundleDiameters({
      connectors,
      junctions,
      cablePaths,
      wireRuns: [
        wire({ id: "run-12", fromConnectorId: "c1", toConnectorId: "c2", wireComponentId: "w-22" }),
        wire({ id: "run-13", fromConnectorId: "c1", toConnectorId: "c3", wireComponentId: "w-22" }),
        wire({ id: "run-23", fromConnectorId: "c2", toConnectorId: "c3", wireComponentId: "w-16" })
      ],
      wireCatalog
    });

    expect(diameters.get("p-trunk")).toBeCloseTo(bundleDiameterInches([0.05, 0.05]) ?? 0, 10);
    expect(diameters.get("p-j2")).toBeCloseTo(bundleDiameterInches([0.05, 0.08]) ?? 0, 10);
    expect(diameters.get("p-j3")).toBeCloseTo(bundleDiameterInches([0.05, 0.08]) ?? 0, 10);
  });

  it("stays blank when any wire on that section has no database diameter", () => {
    const diameters = cableSectionBundleDiameters({
      connectors,
      junctions,
      cablePaths,
      wireRuns: [
        wire({ id: "run-12", fromConnectorId: "c1", toConnectorId: "c2", wireComponentId: "w-blank" }),
        wire({ id: "run-13", fromConnectorId: "c1", toConnectorId: "c3", wireComponentId: "w-22" })
      ],
      wireCatalog
    });

    expect(diameters.get("p-trunk")).toBeNull();
    expect(diameters.get("p-j2")).toBeNull();
    expect(diameters.get("p-j3")).toBeCloseTo(1.155 * 0.05, 10);
  });

  it("resolves wirelist locations and part numbers when the component id is absent", () => {
    const diameters = cableSectionBundleDiameters({
      connectors: [connector("c1", "J1"), connector("c2", "J2")],
      cablePaths: [cable("p-direct", "c1", "c2", 24)],
      wireRuns: [
        wire({
          id: "run-loc",
          fromConnectorId: "",
          toConnectorId: "",
          fromLocation: "J1 - 1",
          toLocation: "J2 - 1",
          wirePartNumber: "M22759/16-22"
        })
      ],
      wireCatalog
    });

    expect(diameters.get("p-direct")).toBeCloseTo(1.155 * 0.05, 10);
  });

  it("does not borrow a diameter from a different part when the linked item has none", () => {
    expect(
      lookupWireOverallDiameterIn(
        { wireComponentId: "w-blank", wirePartNumber: "M22759/16-22" },
        wireCatalog
      )
    ).toBeNull();
    expect(lookupWireOverallDiameterIn({ wirePartNumber: "m22759/16-16" }, wireCatalog)).toBe(0.08);
  });

  it("puts a wire on the shorter parallel section only", () => {
    const parallel = [cable("p-long", "c1", "c2", 30), cable("p-short", "c1", "c2", 4)];
    expect(cableSectionIdsBetween(parallel, ["c1", "c2"], "c1", "c2")).toEqual(["p-short"]);
    const equal = [cable("p-b", "c1", "c2", 10), cable("p-a", "c1", "c2", 10)];
    expect(cableSectionIdsBetween(equal, ["c1", "c2"], "c1", "c2")).toEqual(["p-a"]);
    expect(cableSectionIdsBetween(parallel, ["c1", "c2"], "c1", "c1")).toEqual([]);
    expect(cableSectionIdsBetween([cable("p-direct", "c1", "c2", 4)], ["c1", "c2"], "c1", "c3")).toBeNull();
  });
});

describe("sleeve size for a bundle diameter", () => {
  const sleeves = [
    {
      id: "slv-wide",
      category: "sleeve-tube-braid",
      family: "expandable_sleeving",
      partNumber: "SLV-WIDE",
      attributes: { sizeRanges: [{ minDia: 0.05, maxDia: 0.5 }] }
    },
    {
      id: "slv-tight",
      category: "sleeve-tube-braid",
      family: "expandable_sleeving",
      partNumber: "SLV-TIGHT",
      attributes: { sizeRanges: [{ minDia: 0.08, maxDia: 0.12 }] }
    },
    {
      id: "tube",
      category: "sleeve-tube-braid",
      family: "tubing",
      partNumber: "TUBE-1",
      attributes: { sizeRanges: [{ minDia: 0.08, maxDia: 0.12 }] }
    }
  ];

  it("picks the tightest sleeving or tubing range that contains the bundle", () => {
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "expandable_sleeving",
        bundleDiameterIn: 0.1,
        sleeves
      })?.partNumber
    ).toBe("SLV-TIGHT");
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "expandable_sleeving",
        bundleDiameterIn: 0.08,
        sleeves
      })?.partNumber
    ).toBe("SLV-TIGHT");
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "expandable_sleeving",
        bundleDiameterIn: 0.2,
        sleeves
      })?.partNumber
    ).toBe("SLV-WIDE");
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "tubing",
        bundleDiameterIn: 0.1,
        sleeves
      })?.partNumber
    ).toBe("TUBE-1");
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "none",
        bundleDiameterIn: 0.1,
        sleeves
      })
    ).toBeNull();
    expect(
      selectSleeveForBundleDiameter({
        sleeving: "expandable_sleeving",
        bundleDiameterIn: 0.04,
        sleeves
      })
    ).toBeNull();
  });
});
