import { compatibilityStatus, type CompatibilityRule } from "./compatibility-rules.ts";
import { isBlankModule, type CompatStatus } from "./library.ts";

type AccessoryModule = {
  id: string;
  partNumber?: string;
  category: string;
  family: string;
  description: string;
  electricalMode?: string;
  attributes?: unknown;
};

/** Explicit module/strain-relief fit records may be owned by either part. */
export const STRAIN_RELIEF_RELATIONSHIP_TYPES = ["STRAIN_RELIEF_ALLOWED", "MODULE_ALLOWED", "MATES_WITH"] as const;

function strongestStatus(statuses: Array<CompatStatus | undefined>): CompatStatus | undefined {
  return (["forbidden", "review", "allowed"] as const).find(status => statuses.includes(status));
}

/** Evaluate direct and reciprocal fit evidence without following other parts' relationships. */
export function moduleAccessoryStatus(
  module: AccessoryModule,
  accessory: { id: string; category: string; partNumber: string },
  rules: readonly CompatibilityRule[]
): CompatStatus | undefined {
  if (module.category !== "module") return undefined;
  if (accessory.category === "strain-relief" && isBlankModule(module)) {
    return "forbidden";
  }
  if (accessory.category === "backshell") return compatibilityStatus({
    rules,
    parentPartId: module.id,
    relationshipType: "BACKSHELL_ALLOWED",
    targetPartId: accessory.id,
    targetPartNumber: accessory.partNumber
  });
  if (accessory.category !== "strain-relief") return undefined;
  const direct = compatibilityStatus({ rules, parentPartId: module.id, relationshipType: "STRAIN_RELIEF_ALLOWED", targetPartId: accessory.id, targetPartNumber: accessory.partNumber });
  const reverse = ["STRAIN_RELIEF_ALLOWED", "MODULE_ALLOWED"].map(relationshipType => compatibilityStatus({
    rules, parentPartId: accessory.id, relationshipType, targetPartId: module.id, targetPartNumber: module.partNumber
  }));
  // Mating lists can also describe electrical counterparts. Only the explicit
  // module/strain-relief pair is evidence here; their other targets exclude nothing.
  const mating = rules.filter(rule => rule.relationshipType.trim().toUpperCase() === "MATES_WITH" && (
    rule.parentPartId === module.id && (rule.targetPartIds ? rule.targetPartIds.includes(accessory.id) : rule.compatibleParts.some(pn => pn.trim().toUpperCase() === accessory.partNumber.trim().toUpperCase())) ||
    rule.parentPartId === accessory.id && (rule.targetPartIds ? rule.targetPartIds.includes(module.id) : rule.compatibleParts.some(pn => pn.trim().toUpperCase() === module.partNumber?.trim().toUpperCase()))
  ));
  return strongestStatus([direct, ...reverse,
    compatibilityStatus({ rules: mating, parentPartId: module.id, relationshipType: "MATES_WITH", targetPartId: accessory.id, targetPartNumber: accessory.partNumber }),
    compatibilityStatus({ rules: mating, parentPartId: accessory.id, relationshipType: "MATES_WITH", targetPartId: module.id, targetPartNumber: module.partNumber })
  ]);
}
