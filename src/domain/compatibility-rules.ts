/** Shared by the API validator and browser pickers. No server dependencies. */
export interface CompatibilityRule {
  parentPartId: string;
  relationshipType: string;
  compatibleParts: string[];
  targetPartIds?: string[];
  parentPositions: string[];
  status: string;
  isExhaustive?: boolean;
  unresolvedParts?: string[];
}

const key = (value: string) => value.trim().toUpperCase();

export function compatibilityStatus(input: {
  rules: readonly CompatibilityRule[];
  parentPartId: string;
  relationshipType: string;
  targetPartId?: string;
  targetPartNumber?: string;
  position?: string;
  requireAllowance?: boolean;
}): "allowed" | "forbidden" | "review" | undefined {
  const scoped = input.rules.filter(rule =>
    rule.parentPartId === input.parentPartId && key(rule.relationshipType) === key(input.relationshipType) &&
    (!rule.parentPositions.length || (input.position !== undefined && rule.parentPositions.some(position => key(position) === key(input.position!))))
  );
  const matching = scoped.filter(rule => input.targetPartId && rule.targetPartIds
    ? rule.targetPartIds.includes(input.targetPartId)
    : rule.compatibleParts.some(part => key(part) === key(input.targetPartNumber ?? "")));
  if (matching.some(rule => rule.status === "forbidden")) return "forbidden";
  if (matching.some(rule => rule.status === "review")) return "review";
  if (matching.some(rule => rule.status === "allowed")) return "allowed";
  if (scoped.some(rule => rule.unresolvedParts?.length)) return "review";
  if (input.requireAllowance || scoped.some(rule => rule.status === "allowed" && rule.isExhaustive !== false)) return "forbidden";
  return undefined;
}
