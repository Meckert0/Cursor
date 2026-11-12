import { compatibilityStatus, type CompatibilityRule } from "./compatibility-rules.ts";
import { BLANK_INSERT_FAMILY, catalogPartFamily, type CompatStatus } from "./library.ts";

type AccessoryModule = {
  id: string;
  category: string;
  family: string;
  description: string;
  electricalMode?: string;
  attributes?: unknown;
};

/** Evaluate canonical accessory relationships, including legacy pair rows. */
export function moduleAccessoryStatus(
  module: AccessoryModule,
  accessory: { id: string; category: string; partNumber: string },
  rules: readonly CompatibilityRule[]
): CompatStatus | undefined {
  if (module.category !== "module") return undefined;
  if (accessory.category === "strain-relief" && catalogPartFamily(module) === BLANK_INSERT_FAMILY) {
    return "forbidden";
  }
  const relationshipType = accessory.category === "strain-relief" ? "STRAIN_RELIEF_ALLOWED"
    : accessory.category === "backshell" ? "BACKSHELL_ALLOWED" : undefined;
  if (!relationshipType) return undefined;
  return compatibilityStatus({
    rules,
    parentPartId: module.id,
    relationshipType,
    targetPartId: accessory.id,
    targetPartNumber: accessory.partNumber
  });
}
