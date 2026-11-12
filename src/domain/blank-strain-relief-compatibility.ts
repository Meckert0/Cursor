import { isBlankModule, type PartWithAttributes } from "./library.ts";

export type CompatibilityPart = Pick<PartWithAttributes, "id" | "category" | "partNumber" | "family" | "description" | "electricalMode" | "attributes">;

/** Catalog receiver assemblies can include strain relief while retaining frame slots. */
export function includesStrainRelief(part: { category: string; description: string }): boolean {
  if (part.category === "strain-relief") return true;
  if (part.category !== "frame") return false;
  if (/\b(?:without|no|excluding)\s+(?:a\s+)?strain[\s-]+relief\b/i.test(part.description)) return false;
  if (/\b(?:optional|compatible with)\b[^.;]*\bstrain[\s-]+relief\b/i.test(part.description)) return false;
  return /\b(?:with|including|includes?|integrated|built[\s-]+in)\b[^.;]*\bstrain[\s-]+relief\b|\bstrain[\s-]+relief\s+(?:included|integrated)\b/i.test(part.description);
}

export function isBlankStrainReliefPair(parent: CompatibilityPart, target: CompatibilityPart): boolean {
  return includesStrainRelief(parent) && isBlankModule(target) || includesStrainRelief(target) && isBlankModule(parent);
}

/** Remove invalid direct links; frames without strain relief can still accept blanks. */
export function pruneBlankStrainReliefTargets<T extends {
  parentPartId: string; targetPartIds?: string[]; compatibleParts: string[]; unresolvedParts?: string[];
}>(row: T, parts: readonly CompatibilityPart[]): { row: T; removedTargetIds: string[]; removedUnresolved: string[]; empty: boolean } {
  const byId = new Map(parts.map(part => [part.id, part]));
  const parent = byId.get(row.parentPartId);
  if (!parent) return { row, removedTargetIds: [], removedUnresolved: [], empty: false };
  const byNumber = new Map<string, CompatibilityPart[]>();
  for (const part of parts) {
    const key = part.partNumber.trim().toUpperCase();
    byNumber.set(key, [...(byNumber.get(key) ?? []), part]);
  }
  const invalidNumber = (pn: string) => {
    const matches = byNumber.get(pn.trim().toUpperCase()) ?? [];
    return matches.length > 0 && matches.every(target => isBlankStrainReliefPair(parent, target));
  };
  const removedTargetIds = (row.targetPartIds ?? []).filter(id => {
    const target = byId.get(id);
    return target !== undefined && isBlankStrainReliefPair(parent, target);
  });
  const removedIds = new Set(removedTargetIds);
  const targetPartIds = row.targetPartIds?.filter(id => !removedIds.has(id));
  const compatibleParts = row.targetPartIds
    ? row.compatibleParts.filter((_, index) => !removedIds.has(row.targetPartIds![index]))
    : row.compatibleParts.filter(pn => !invalidNumber(pn));
  const removedUnresolved = (row.unresolvedParts ?? []).filter(invalidNumber);
  const unresolvedParts = row.unresolvedParts?.filter(pn => !removedUnresolved.includes(pn));
  const changed = removedTargetIds.length > 0 || removedUnresolved.length > 0 || compatibleParts.length !== row.compatibleParts.length;
  return {
    row: changed ? { ...row, targetPartIds, compatibleParts, unresolvedParts: unresolvedParts?.length ? unresolvedParts : undefined } : row,
    removedTargetIds, removedUnresolved,
    empty: changed && (targetPartIds?.length ?? compatibleParts.length) === 0 && !unresolvedParts?.length
  };
}
