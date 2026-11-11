import type { CategoryAttributesMap, LibraryCategory, WireAttributes } from "./library.js";

export class CatalogError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}

export function normalizeWireAttributes(attributes: WireAttributes): WireAttributes {
  const rawGauge = attributes.awg?.trim();
  const legacyCable = rawGauge && !/^(?:(?:AWG\s*)?\d+(?:\.\d+)?(?:\s*AWG)?|[1-4]\/0)$/i.test(rawGauge) ? rawGauge : undefined;
  const wireType = attributes.wireType?.trim();
  return {
    ...attributes,
    awg: legacyCable ? undefined : attributes.awg?.trim() || undefined,
    cableDesignation: attributes.cableDesignation?.trim() || legacyCable,
    construction: attributes.construction?.trim() || (/^RG[- ]?\d+$/i.test(legacyCable ?? wireType ?? "") ? "coax" : undefined)
  };
}

export function validateCatalogAttributes(category: LibraryCategory, attributes: CategoryAttributesMap[LibraryCategory]): void {
  const values = attributes as unknown as Record<string, unknown>;
  if (category === "wire") {
    const wire = normalizeWireAttributes(attributes as WireAttributes);
    if ((!wire.awg && !wire.cableDesignation && !wire.construction) || !wire.color?.trim()) throw new CatalogError("WIRE_FIELDS_REQUIRED: Supply a conductor gauge or cable designation/construction, and color.");
  }
  const fields = category === "label"
    ? ["fitDiameterMinIn", "fitDiameterMaxIn", "printableWidthIn", "printableHeightIn", "maxCharactersPerLine", "maxLines"]
    : category === "contact" ? ["acceptedInsulationDiaMinIn", "acceptedInsulationDiaMaxIn"]
    : category === "wire" ? ["insulatedConductorDiaIn"] : [];
  for (const field of fields) {
    const value = values[field];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || (["maxLines", "maxCharactersPerLine"].includes(field) && !Number.isInteger(value)))) {
      throw new CatalogError(`CATALOG_INVALID_${field}: Supply a positive ${field.startsWith("max") ? "integer" : "number"}.`);
    }
  }
  for (const [minimum, maximum] of [["fitDiameterMinIn", "fitDiameterMaxIn"], ["acceptedInsulationDiaMinIn", "acceptedInsulationDiaMaxIn"]]) {
    if (typeof values[minimum] === "number" && typeof values[maximum] === "number" && values[minimum] > values[maximum]) throw new CatalogError(`CATALOG_DIAMETER_RANGE: ${minimum} must not exceed ${maximum}.`);
  }
}
