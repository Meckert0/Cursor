import { describe, expect, it } from "vitest";
import { buildSleeveDiameterCatalog } from "../../../../src/domain/sleeve-diameter-catalog";
import type { SleeveTubeBraidAttributes } from "../../../../src/domain/library";
import type { LibraryComponentDto } from "./api";
import type { UniqueWireSection } from "./cable-canvas-utils";
import { selectSleeveForBundleDiameter } from "./bundle-diameter";
import { buildCableSectionMaterials, formatMaterialLength, totalCableSectionMaterials } from "./cable-section-materials";

const sleeveCatalog: LibraryComponentDto[] = buildSleeveDiameterCatalog().map((item) => ({
  ...item,
  id: item.id!,
  attributes: { sizeRanges: (item.attributes as SleeveTubeBraidAttributes).sizeRanges },
  createdByUserId: "catalog",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastEditedByUserId: "catalog",
  lastEditedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
}));

function section(pathId: string, lengthFt: number, sleeving: UniqueWireSection["sleeving"]): UniqueWireSection {
  return { pathId, wireName: pathId, fromNodeId: "c1", toNodeId: "c2", lengthFt, sleeving };
}

describe("supplied covering sizes", () => {
  it.each([
    ["expandable_sleeving", 0.75, "875010"],
    ["expandable_sleeving", 0.750001, "875011"],
    ["expandable_sleeving", 1.75, "875011"],
    ["expandable_sleeving", 1.750001, undefined],
    ["wire_braid", 0.38, "875012"],
    ["wire_braid", 0.380001, "875013"],
    ["wire_braid", 0.875, "875013"],
    ["wire_braid", 0.875001, "875014"],
    ["wire_braid", 2, "875014"],
    ["wire_braid", 2.000001, undefined],
    ["shrink_tubing", 1, "875000"],
    ["shrink_tubing", 1.000001, "875001"]
  ])("selects %s at %s inches", (sleeving, diameter, partNumber) => {
    expect(selectSleeveForBundleDiameter({
      sleeving: sleeving as string,
      bundleDiameterIn: diameter as number,
      sleeves: sleeveCatalog
    })?.partNumber).toBe(partNumber);
  });

  it("excludes an open minimum even when the smaller part is unavailable", () => {
    expect(selectSleeveForBundleDiameter({
      sleeving: "expandable_sleeving",
      bundleDiameterIn: 0.75,
      sleeves: sleeveCatalog.filter((part) => part.partNumber === "875011")
    })).toBeNull();
  });
});

describe("cable section material totals", () => {
  it("sums repeated part numbers and both layers while excluding bare sections and tubing", () => {
    const rows = buildCableSectionMaterials({
      sections: [
        section("sleeved", 12.25, "expandable_sleeving"),
        section("braided", 6.5, "wire_braid_under_expandable_sleeving"),
        section("large", 4, "wire_braid_under_expandable_sleeving"),
        section("bare", 3, "none")
      ],
      bundleDiameters: new Map([["sleeved", 0.25], ["braided", 0.5], ["large", 1], ["bare", 0.25]]),
      sleeveCatalog
    });
    expect(rows.map((row) => row.materials.map((material) => material.part?.partNumber))).toEqual([
      ["875010"], ["875010", "875013"], ["875011", "875014"], []
    ]);
    expect(totalCableSectionMaterials(rows)).toEqual({
      cableLengthIn: 25.75,
      byMaterial: { expandable_sleeving: 22.75, wire_braid: 10.5 },
      materialLengthIn: 33.25,
      parts: [
        { kind: "expandable_sleeving", partNumber: "875010", lengthIn: 18.75 },
        { kind: "expandable_sleeving", partNumber: "875011", lengthIn: 4 },
        { kind: "wire_braid", partNumber: "875013", lengthIn: 6.5 },
        { kind: "wire_braid", partNumber: "875014", lengthIn: 4 }
      ]
    });
  });

  it("keeps unsized material visible without assigning a guessed part number", () => {
    const rows = buildCableSectionMaterials({
      sections: [section("missing", 8, "wire_braid_under_expandable_sleeving"), section("oversize", 4, "expandable_sleeving")],
      bundleDiameters: new Map([["missing", null], ["oversize", 2.1]]),
      sleeveCatalog
    });
    expect(rows.every((row) => row.materials.every((material) => material.part === null))).toBe(true);
    expect(totalCableSectionMaterials(rows).parts).toEqual([
      { kind: "expandable_sleeving", partNumber: null, lengthIn: 12 },
      { kind: "wire_braid", partNumber: null, lengthIn: 8 }
    ]);
    expect(formatMaterialLength(0.1 + 0.2)).toBe("0.3 in");
  });
});
