import {
  emptyAttributesForCategory,
  type CategoryAttributesMap,
  type LibraryCategory,
  type PartWithAttributes
} from "./library.js";

const DEFAULT_TS = "2026-01-01T00:00:00.000Z";

/**
 * Build a PartWithAttributes fixture with identity defaults and category-empty attributes
 * merged with any provided attributes.
 */
export function makePart(
  partial: Partial<PartWithAttributes> &
    Pick<PartWithAttributes, "id" | "category" | "partNumber" | "family" | "description">
): PartWithAttributes {
  const category = partial.category as LibraryCategory;
  const attributes = {
    ...emptyAttributesForCategory(category),
    ...(partial.attributes ?? {})
  } as CategoryAttributesMap[typeof category];

  return {
    isActive: true,
    isReviewed: true,
    stockStatus: "in_stock",
    createdByUserId: "seed",
    createdAt: DEFAULT_TS,
    lastEditedByUserId: "seed",
    lastEditedAt: DEFAULT_TS,
    updatedAt: DEFAULT_TS,
    ...partial,
    category,
    attributes
  } as PartWithAttributes;
}
