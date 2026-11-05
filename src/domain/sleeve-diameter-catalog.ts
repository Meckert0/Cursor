import { makePartId } from "./cpq-import/part-id.js";
import {
  isSleeveTubeBraidPart,
  type LibraryIngestResult,
  type PartIngestItem,
  type PartWithAttributes,
  type SleeveTubeBraidAttributes
} from "./library.js";

const CATALOG_USER_ID = "sleeve-diameter-catalog";

/** Minimums above zero are exclusive; every maximum is inclusive, in inches. */
const DIAMETER_RANGES = [
  { partNumber: "875010", family: "expandable_sleeving", label: "Expandable sleeving", minDia: 0, maxDia: 0.75 },
  { partNumber: "875011", family: "expandable_sleeving", label: "Expandable sleeving", minDia: 0.75, maxDia: 1.75 },
  { partNumber: "875000", family: "shrink_tubing", label: "Shrink tubing", minDia: 0, maxDia: 1 },
  { partNumber: "875001", family: "shrink_tubing", label: "Shrink tubing", minDia: 1, maxDia: 2 },
  { partNumber: "875012", family: "wire_braid", label: "Wire braid", minDia: 0, maxDia: 0.38 },
  { partNumber: "875013", family: "wire_braid", label: "Wire braid", minDia: 0.38, maxDia: 0.875 },
  { partNumber: "875014", family: "wire_braid", label: "Wire braid", minDia: 0.875, maxDia: 2 }
];

export function buildSleeveDiameterCatalog(): PartIngestItem[] {
  return DIAMETER_RANGES.map(({ partNumber, family, label, minDia, maxDia }) => ({
    id: makePartId("sleeve-tube-braid", partNumber),
    category: "sleeve-tube-braid",
    family,
    partNumber,
    description: `${label}, acceptable diameter ${minDia > 0 ? `> ${minDia} and ` : ""}<= ${maxDia} in`,
    isActive: true,
    isReviewed: true,
    stockStatus: "unknown",
    attributes: { sizeRanges: [{ minDia, maxDia, minInclusive: minDia === 0 }] }
  }));
}

interface SleeveDiameterCatalogStore {
  listLibraryComponents(input: {
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<PartWithAttributes[]>;
  ingestLibraryComponents(input: {
    items: PartIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
  }): Promise<LibraryIngestResult>;
  updateLibraryComponent(input: {
    componentId: string;
    attributes?: Partial<SleeveTubeBraidAttributes>;
    editedByUserId?: string;
  }): Promise<PartWithAttributes | null>;
}

/** Seed missing parts without duplicating part numbers or replacing user metadata. */
export async function ensureSleeveDiameterCatalog(store: SleeveDiameterCatalogStore) {
  const existing = await store.listLibraryComponents({
    requestingUserId: CATALOG_USER_ID,
    canViewAllUnreviewed: true,
    canViewInactive: true
  });
  const byPartNumber = new Map(
    existing.filter(isSleeveTubeBraidPart).map((part) => [part.partNumber.trim().toLowerCase(), part])
  );
  const missing: PartIngestItem[] = [];
  let updated = 0;
  let skipped = 0;
  for (const item of buildSleeveDiameterCatalog()) {
    const found = byPartNumber.get(item.partNumber.toLowerCase());
    if (!found) {
      missing.push(item);
      continue;
    }
    const attributes = item.attributes as SleeveTubeBraidAttributes;
    const ranges = found.attributes.sizeRanges ?? [];
    if (ranges.length === 0 || (found.id === item.id && JSON.stringify(ranges) !== JSON.stringify(attributes.sizeRanges))) {
      await store.updateLibraryComponent({
        componentId: found.id,
        attributes,
        editedByUserId: CATALOG_USER_ID
      });
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  if (missing.length > 0) {
    const result = await store.ingestLibraryComponents({
      items: missing,
      requestedByUserId: CATALOG_USER_ID,
      dryRun: false
    });
    if (result.summary.rejected > 0) {
      throw new Error(`Sleeve diameter catalog ingest rejected ${result.summary.rejected} item(s): ${result.results
        .filter((row) => row.status === "rejected")
        .map((row) => row.message ?? "rejected")
        .join("; ")}`);
    }
  }
  return { inserted: missing.length, updated, skipped };
}
