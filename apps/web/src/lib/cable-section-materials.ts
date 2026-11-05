import type { LibraryComponentDto } from "./api";
import type { UniqueWireSection } from "./cable-canvas-utils";
import { selectSleeveForBundleDiameter } from "./bundle-diameter";

export const CABLE_MATERIAL_LABELS = {
  expandable_sleeving: "Expandable sleeving",
  wire_braid: "Wire braid"
} as const;

type MaterialKind = keyof typeof CABLE_MATERIAL_LABELS;

export type CableSectionMaterial = {
  kind: MaterialKind;
  part: { id: string; partNumber: string } | null;
};

export type CableSectionWithMaterials = UniqueWireSection & {
  bundleDiameterIn: number | null;
  materials: CableSectionMaterial[];
};

/** A braided section uses a full length of each layer. Tubing is not yet applied. */
export function buildCableSectionMaterials(input: {
  sections: UniqueWireSection[];
  bundleDiameters: Map<string, number | null>;
  sleeveCatalog: LibraryComponentDto[];
}): CableSectionWithMaterials[] {
  return input.sections.map((section) => {
    const bundleDiameterIn = input.bundleDiameters.get(section.pathId) ?? null;
    const kinds: MaterialKind[] = section.sleeving === "none" ? [] : ["expandable_sleeving"];
    if (section.sleeving === "wire_braid_under_expandable_sleeving") {
      kinds.push("wire_braid");
    }
    return {
      ...section,
      bundleDiameterIn,
      materials: kinds.map((kind) => ({
        kind,
        part: selectSleeveForBundleDiameter({
          sleeving: kind,
          bundleDiameterIn,
          sleeves: input.sleeveCatalog
        })
      }))
    };
  });
}

export function totalCableSectionMaterials(sections: CableSectionWithMaterials[]) {
  const byPart = new Map<string, { kind: MaterialKind; partNumber: string | null; lengthIn: number }>();
  const byMaterial: Record<MaterialKind, number> = { expandable_sleeving: 0, wire_braid: 0 };
  let cableLengthIn = 0;
  for (const section of sections) {
    // The existing section model's lengthFt property stores inches.
    const lengthIn = section.lengthFt;
    cableLengthIn += lengthIn;
    for (const material of section.materials) {
      const partNumber = material.part?.partNumber ?? null;
      const key = JSON.stringify([material.kind, partNumber]);
      const total = byPart.get(key) ?? { kind: material.kind, partNumber, lengthIn: 0 };
      total.lengthIn += lengthIn;
      byPart.set(key, total);
      byMaterial[material.kind] += lengthIn;
    }
  }
  const kinds = Object.keys(CABLE_MATERIAL_LABELS) as MaterialKind[];
  return {
    cableLengthIn,
    byMaterial,
    materialLengthIn: byMaterial.expandable_sleeving + byMaterial.wire_braid,
    parts: [...byPart.values()].sort(
      (left, right) => kinds.indexOf(left.kind) - kinds.indexOf(right.kind) ||
        (left.partNumber ?? "~").localeCompare(right.partNumber ?? "~")
    )
  };
}

export function formatMaterialLength(lengthIn: number): string {
  return `${Number(lengthIn.toFixed(3))} in`;
}
