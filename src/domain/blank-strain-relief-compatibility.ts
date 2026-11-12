import { isBlankModule, type PartWithAttributes } from "./library.ts";

export type CompatibilityPart = Pick<PartWithAttributes, "id" | "category" | "partNumber" | "family" | "description" | "electricalMode" | "attributes">;

export function isBlankStrainReliefPair(parent: CompatibilityPart, target: CompatibilityPart): boolean {
  return parent.category === "strain-relief" && isBlankModule(target) || target.category === "strain-relief" && isBlankModule(parent);
}

/** Remove invalid direct links only; frame-to-blank relationships are retained. */
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
