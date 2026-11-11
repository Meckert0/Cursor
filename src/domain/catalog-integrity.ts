import { CatalogError } from "./catalog-attributes.js";
import { normalizePartRelationship, type PartRelationship, type PartRelationshipInput, type PartWithAttributes, type PartMediaInput } from "./library.js";

export const RELATIONSHIP_CATEGORIES: Record<string, { parent: string; target: string }> = {
  MODULE_ALLOWED: { parent: "frame", target: "module" },
  INSERT_ALLOWED: { parent: "module", target: "module" },
  CONTACT_ALLOWED: { parent: "module", target: "contact" },
  WIRE_ALLOWED: { parent: "contact", target: "wire" },
  WIRE_COMPATIBILITY: { parent: "contact", target: "wire" },
  BACKSHELL_ALLOWED: { parent: "module", target: "backshell" },
  STRAIN_RELIEF_ALLOWED: { parent: "module", target: "strain-relief" }
};

export function resolveRelationshipInput(input: PartRelationshipInput, parts: readonly (Pick<PartWithAttributes, "id" | "category" | "partNumber" | "attributes"> & { isArchived?: boolean })[], preserveUnresolved = false): PartRelationship {
  const row = normalizePartRelationship(input);
  const parent = parts.find(part => part.id === row.parentPartId);
  if (!parent) {
    if (preserveUnresolved) return { ...row, source: row.source ?? "legacy-catalog", unresolvedParts: [...new Set([...(row.unresolvedParts ?? []), ...row.compatibleParts, `Missing parent: ${row.parentPartId}`])] };
    throw new CatalogError("COMPATIBILITY_PARENT_NOT_FOUND");
  }
  const categories = RELATIONSHIP_CATEGORIES[row.relationshipType];
  if (categories && parent.category !== categories.parent) throw new CatalogError("COMPATIBILITY_PARENT_CATEGORY");
  const targetIds = new Set<string>();
  const unresolved = new Set<string>(preserveUnresolved ? input.unresolvedParts : []);
  if (input.targetPartIds !== undefined) {
    for (const id of input.targetPartIds) {
      const target = parts.find(part => part.id === id);
      if (!target) { if (preserveUnresolved) { unresolved.add(id); continue; } throw new CatalogError(`COMPATIBILITY_TARGET_NOT_FOUND: ${id}`); }
      if (categories && target.category !== categories.target) throw new CatalogError("COMPATIBILITY_TARGET_CATEGORY");
      targetIds.add(id);
    }
  } else {
    for (const pn of [...row.compatibleParts, ...(input.unresolvedParts ?? [])]) {
      const matches = parts.filter(part => !part.isArchived && part.partNumber.trim().toUpperCase() === pn.toUpperCase() && (!categories || part.category === categories.target));
      if (matches.length !== 1) {
        if (!preserveUnresolved) throw new CatalogError(`COMPATIBILITY_TARGET_${matches.length ? "AMBIGUOUS" : "NOT_FOUND"}: ${pn}`);
        unresolved.add(pn);
      } else targetIds.add(matches[0].id);
    }
  }
  if (targetIds.has(parent.id)) throw new CatalogError("COMPATIBILITY_SELF_REFERENCE");
  const attrs = parent.attributes as unknown as Record<string, unknown>;
  const knownPositions = parent.category === "frame" ? attrs.slotIds : row.relationshipType === "INSERT_ALLOWED"
    ? (Array.isArray(attrs.simSlotSections) ? attrs.simSlotSections.flat() : []) : attrs.pinIds;
  if (Array.isArray(knownPositions) && knownPositions.length && row.parentPositions.some(position => !knownPositions.some(known => String(known).toUpperCase() === position.toUpperCase()))) {
    throw new CatalogError("COMPATIBILITY_POSITION_NOT_FOUND");
  }
  return {
    ...row,
    targetPartIds: [...targetIds],
    compatibleParts: [...targetIds].map(id => parts.find(part => part.id === id)!.partNumber),
    unresolvedParts: unresolved.size ? [...unresolved] : undefined,
    isExhaustive: input.isExhaustive ?? (!row.legacyPairKey && ["MODULE_ALLOWED", "INSERT_ALLOWED", "CONTACT_ALLOWED"].includes(row.relationshipType))
  };
}

export function validatePartMedia(input: PartMediaInput): void {
  let url: URL;
  try { url = new URL(input.url); } catch { throw new CatalogError("CATALOG_MEDIA_URL: Supply an HTTP or HTTPS file URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new CatalogError("CATALOG_MEDIA_URL: Supply an HTTP or HTTPS file URL without credentials.");
  if (!input.partId.trim() || !input.viewType.trim()) throw new CatalogError("CATALOG_MEDIA_FIELDS_REQUIRED");
  for (const value of [input.pixelWidth, input.pixelHeight]) if (value != null && (!Number.isInteger(value) || value <= 0)) throw new CatalogError("CATALOG_MEDIA_DIMENSIONS");
  if (input.sortOrder != null && (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)) throw new CatalogError("CATALOG_MEDIA_ORDER");
}
