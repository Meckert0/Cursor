import { normalizeWireAttributes } from "./catalog-attributes.js";
import { makePartId } from "./cpq-import/part-id.js";
import {
  isWirePart,
  type LibraryIngestResult,
  type PartIngestItem,
  type PartWithAttributes,
  type WireAttributes
} from "./library.js";

/**
 * Wire items loaded into the item database from the supplied diameter table
 * and part-number list. Add further rows here; startup inserts any part
 * number that is not already present.
 *
 * Assigned part numbers are the Teflon wires. Their diameters are the plain
 * AWG rows (not T/P or ST/P). Rows that have a diameter and no part number
 * are stored under a TBD-* part number so the diameter is not dropped.
 */
const PLAIN_AWG_DIAMETER_IN: Record<string, number> = {
  "2": 0.486,
  "8": 0.26,
  "10": 0.194,
  "12": 0.159,
  "14": 0.141,
  "16": 0.087,
  "18": 0.074,
  "20": 0.062,
  "22": 0.056,
  "24": 0.049,
  "26": 0.044,
  "28": 0.049,
  "30": 0.037
};

const TWISTED_PAIR_DIAMETER_IN: Record<string, number> = {
  "8": 0.52,
  "10": 0.388,
  "12": 0.318,
  "14": 0.204,
  "16": 0.174,
  "18": 0.148,
  "20": 0.128,
  "22": 0.112,
  "24": 0.098,
  "26": 0.088,
  "28": 0.08,
  "30": 0.074
};

const SHIELDED_TWISTED_PAIR_DIAMETER_IN: Record<string, number> = {
  "14": 0.222,
  "16": 0.187,
  "18": 0.171,
  "20": 0.15,
  "22": 0.134,
  "24": 0.12,
  "26": 0.108
};

const COAX_DIAMETER_IN: Record<string, number> = {
  "RG-316": 0.103,
  "RG-178": 0.075,
  "RG-179": 0.105
};

/** Part number, AWG, color. Descriptions in the source sheet are "{awg} AWG {color} (Teflon)". */
const TEFLON_WIRES: Array<{ partNumber: string; awg: string; color: "Black" | "White" }> = [
  { partNumber: "270763", awg: "8", color: "Black" },
  { partNumber: "269247", awg: "10", color: "Black" },
  { partNumber: "019810", awg: "12", color: "Black" },
  { partNumber: "270408", awg: "14", color: "Black" },
  { partNumber: "019601", awg: "16", color: "Black" },
  { partNumber: "951260", awg: "18", color: "Black" },
  { partNumber: "021311", awg: "20", color: "Black" },
  { partNumber: "038037", awg: "22", color: "Black" },
  { partNumber: "019100", awg: "24", color: "Black" },
  { partNumber: "024425", awg: "26", color: "Black" },
  { partNumber: "019211", awg: "28", color: "Black" },
  { partNumber: "224304", awg: "30", color: "Black" },
  { partNumber: "270733", awg: "8", color: "White" },
  { partNumber: "019920", awg: "10", color: "White" },
  { partNumber: "019910", awg: "12", color: "White" },
  { partNumber: "260848", awg: "14", color: "White" },
  { partNumber: "019600", awg: "16", color: "White" },
  { partNumber: "019605", awg: "18", color: "White" },
  { partNumber: "021310", awg: "20", color: "White" },
  { partNumber: "038033", awg: "22", color: "White" },
  { partNumber: "021800", awg: "24", color: "White" },
  { partNumber: "019210", awg: "26", color: "White" },
  { partNumber: "261108", awg: "28", color: "White" },
  { partNumber: "224303", awg: "30", color: "White" }
];

const TBD_NOTE =
  "Part number TBD. Wire diameter kept from the diameter table until a real part number is assigned.";

export const WIRE_DIAMETER_CATALOG_USER_ID = "wire-diameter-catalog";

function diameterFor(table: Record<string, number>, key: string): number {
  const diameter = table[key];
  if (typeof diameter !== "number" || !Number.isFinite(diameter) || diameter <= 0) {
    throw new Error(`Missing wire diameter for ${key}.`);
  }
  return diameter;
}

function ingestItem(input: {
  partNumber: string;
  awg: string;
  color: string;
  description: string;
  family: string;
  overallDia: number;
  wireType?: string;
  insulationMaterial?: string;
  numberOfConductors?: number;
  notes?: string;
}): PartIngestItem {
  const attributes: WireAttributes = {
    awg: input.awg,
    color: input.color,
    overallDia: input.overallDia,
    wireType: input.wireType,
    insulationMaterial: input.insulationMaterial,
    numberOfConductors: input.numberOfConductors
  };
  return {
    id: makePartId("wire", input.partNumber),
    category: "wire",
    partType: input.partNumber.startsWith("TBD-") ? "WIRE_REFERENCE" : "WIRE",
    family: input.family,
    partNumber: input.partNumber,
    description: input.description,
    isActive: true,
    stockStatus: "unknown",
    isReviewed: true,
    notes: input.notes,
    attributes: normalizeWireAttributes({ ...attributes, construction: input.family === "Coax" ? "coax" : input.wireType === "T/P" ? "twisted_pair" : input.wireType === "ST/P" ? "shielded_twisted_pair" : "single" })
  };
}

export function buildWireDiameterCatalog(): PartIngestItem[] {
  const items: PartIngestItem[] = [];

  for (const wire of TEFLON_WIRES) {
    items.push(
      ingestItem({
        partNumber: wire.partNumber,
        awg: wire.awg,
        color: wire.color,
        description: `${wire.awg} AWG ${wire.color} (Teflon)`,
        family: "Teflon",
        overallDia: diameterFor(PLAIN_AWG_DIAMETER_IN, wire.awg),
        wireType: "single",
        insulationMaterial: "Teflon",
        numberOfConductors: 1
      })
    );
  }

  items.push(
    ingestItem({
      partNumber: "TBD-2-AWG",
      awg: "2",
      color: "TBD",
      description: "2 AWG",
      family: "TBD",
      overallDia: diameterFor(PLAIN_AWG_DIAMETER_IN, "2"),
      wireType: "single",
      numberOfConductors: 1,
      notes: TBD_NOTE
    })
  );

  for (const [wireType, overallDia] of Object.entries(COAX_DIAMETER_IN)) {
    items.push(
      ingestItem({
        partNumber: `TBD-${wireType}`,
        awg: wireType,
        color: "TBD",
        description: wireType,
        family: "Coax",
        overallDia,
        wireType,
        numberOfConductors: 1,
        notes: TBD_NOTE
      })
    );
  }

  for (const [awg, overallDia] of Object.entries(TWISTED_PAIR_DIAMETER_IN)) {
    items.push(
      ingestItem({
        partNumber: `TBD-${awg}-AWG-TP`,
        awg,
        color: "TBD",
        description: `${awg} AWG T/P`,
        family: "Twisted pair",
        overallDia,
        wireType: "T/P",
        numberOfConductors: 2,
        notes: TBD_NOTE
      })
    );
  }

  for (const [awg, overallDia] of Object.entries(SHIELDED_TWISTED_PAIR_DIAMETER_IN)) {
    items.push(
      ingestItem({
        partNumber: `TBD-${awg}-AWG-STP`,
        awg,
        color: "TBD",
        description: `${awg} AWG ST/P`,
        family: "Shielded twisted pair",
        overallDia,
        wireType: "ST/P",
        numberOfConductors: 2,
        notes: TBD_NOTE
      })
    );
  }

  const seen = new Set<string>();
  for (const item of items) {
    const key = item.partNumber.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate wire diameter catalog part number ${item.partNumber}.`);
    }
    seen.add(key);
  }
  return items;
}

export interface WireDiameterCatalogStore {
  listLibraryComponents(input: {
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<PartWithAttributes[]>;
  ingestLibraryComponents(input: {
    items: PartIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult>;
  updateLibraryComponent(input: {
    componentId: string;
    attributes?: Partial<WireAttributes>;
    editedByUserId?: string;
  }): Promise<PartWithAttributes | null>;
}

export type WireDiameterCatalogSync = {
  inserted: number;
  updated: number;
  skipped: number;
};

/**
 * Insert catalog wires that are not already in the item database.
 * An existing part with the same part number keeps its other fields.
 * A missing overall diameter is filled in. A catalog-owned part whose
 * diameter changed in this list is updated. A different diameter already
 * stored on some other part is left alone.
 */
export async function ensureWireDiameterCatalog(store: WireDiameterCatalogStore): Promise<WireDiameterCatalogSync> {
  const existing = await store.listLibraryComponents({
    requestingUserId: WIRE_DIAMETER_CATALOG_USER_ID,
    canViewAllUnreviewed: true,
    canViewInactive: true
  });
  const wiresByPartNumber = new Map<string, PartWithAttributes & { category: "wire"; attributes: WireAttributes }>();
  for (const part of existing) {
    if (!isWirePart(part)) {
      continue;
    }
    wiresByPartNumber.set(part.partNumber.trim().toLowerCase(), part);
  }

  const missing: PartIngestItem[] = [];
  let updated = 0;
  let skipped = 0;
  for (const item of buildWireDiameterCatalog()) {
    const attributes = item.attributes as WireAttributes;
    const found = wiresByPartNumber.get(item.partNumber.trim().toLowerCase());
    if (!found) {
      missing.push(item);
      continue;
    }
    const nextDiameter = attributes.overallDia;
    const currentDiameter = found.attributes.overallDia;
    const missingDiameter = typeof currentDiameter !== "number" || !Number.isFinite(currentDiameter) || currentDiameter <= 0;
    const catalogOwned = found.id === item.id;
    if (typeof nextDiameter === "number" && (missingDiameter || (catalogOwned && currentDiameter !== nextDiameter))) {
      await store.updateLibraryComponent({
        componentId: found.id,
        attributes: { overallDia: nextDiameter },
        editedByUserId: WIRE_DIAMETER_CATALOG_USER_ID
      });
      updated += 1;
      continue;
    }
    skipped += 1;
  }

  if (missing.length > 0) {
    const result = await store.ingestLibraryComponents({
      items: missing,
      requestedByUserId: WIRE_DIAMETER_CATALOG_USER_ID,
      dryRun: false
    });
    if (result.summary.rejected > 0) {
      const messages = result.results
        .filter((row) => row.status === "rejected")
        .map((row) => row.message ?? "rejected")
        .join("; ");
      throw new Error(`Wire diameter catalog ingest rejected ${result.summary.rejected} item(s): ${messages}`);
    }
  }

  return { inserted: missing.length, updated, skipped };
}
