import { CatalogError, validateCatalogAttributes } from "./catalog-attributes.js";
import { resolveRelationshipInput } from "./catalog-integrity.js";
import { emptyAttributesForCategory, type BackshellAttributes, type PartRelationship, type PartWithAttributes, type StrainReliefAttributes } from "./library.js";

export interface CreateCompatibleAccessoryInput {
  parentPartId: string;
  category: "backshell" | "strain-relief";
  partNumber: string;
  family: string;
  description: string;
  attributes: BackshellAttributes | StrainReliefAttributes;
  requestedByUserId: string;
  canViewAllUnreviewed: boolean;
}

export interface CreatedCompatibleAccessory {
  part: PartWithAttributes;
  relationship: PartRelationship;
}

export const ACCESSORY_DUPLICATE_MESSAGE = "That part number already exists in this category. Choose a new part number or ask an admin to link the existing part.";

/** Prepare both records before either is written, including the hard blank-module restriction. */
export function prepareCompatibleAccessory(input: CreateCompatibleAccessoryInput, parent: PartWithAttributes | undefined): CreatedCompatibleAccessory {
  if (!parent || parent.isArchived || !parent.isActive || (!parent.isReviewed && parent.createdByUserId !== input.requestedByUserId && !input.canViewAllUnreviewed)) {
    throw new CatalogError("Choose an active module visible to your account.", 404);
  }
  if (parent.category !== "module") throw new CatalogError("Compatible accessories can only be added to modules.");
  if (input.category !== "backshell" && input.category !== "strain-relief") throw new CatalogError("Choose a backshell or strain relief category.");
  if (![input.partNumber, input.family, input.description].every(value => value.trim())) throw new CatalogError("Part number, family, and description are required.");
  const attributes = { ...emptyAttributesForCategory(input.category), ...input.attributes };
  validateCatalogAttributes(input.category, attributes);
  const now = new Date().toISOString();
  const part = {
    id: `part-${input.category}-${crypto.randomUUID()}`, category: input.category,
    partNumber: input.partNumber.trim(), family: input.family.trim(), description: input.description.trim(), attributes,
    isActive: true, isReviewed: false, stockStatus: "in_stock", createdByUserId: input.requestedByUserId,
    createdAt: now, lastEditedByUserId: input.requestedByUserId, lastEditedAt: now, updatedAt: now
  } as PartWithAttributes;
  const kind = input.category === "backshell" ? "module-backshell" : "module-strain-relief";
  const legacyPairKey = `${kind}:${parent.id}:${part.id}`;
  const relationship = resolveRelationshipInput({
    id: `pair-${legacyPairKey}`, legacyPairKey, parentPartId: parent.id, targetPartIds: [part.id],
    relationshipType: input.category === "backshell" ? "BACKSHELL_ALLOWED" : "STRAIN_RELIEF_ALLOWED",
    parentPositions: [], status: "allowed", isExhaustive: false, source: "user-entered-compatible-part"
  }, [parent, part]);
  return { part, relationship };
}
