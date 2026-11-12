import type { PartDto, PartRelationshipDto } from "@/lib/api";
import { formatContactPositionList } from "@/lib/connector-contact-groups";
import { pruneBlankStrainReliefTargets } from "../../../../../src/domain/blank-strain-relief-compatibility";

export interface CompatiblePartDisplay {
  id?: string;
  partNumber: string;
  description: string;
}

export function compatiblePartDisplays(row: PartRelationshipDto, catalog: PartDto[]): CompatiblePartDisplay[] {
  row = pruneBlankStrainReliefTargets(row, catalog).row;
  const byId = new Map(catalog.map(part => [part.id, part]));
  if (row.targetPartIds) return row.targetPartIds.map((id, index) => {
    const part = byId.get(id);
    return { id, partNumber: part?.partNumber ?? row.compatibleParts[index] ?? id, description: part?.description ?? "" };
  });
  return row.compatibleParts.map(partNumber => {
    const matches = catalog.filter(part => part.partNumber.trim().toLowerCase() === partNumber.trim().toLowerCase());
    const part = matches.length === 1 ? matches[0] : undefined;
    return { id: part?.id, partNumber, description: part?.description ?? "" };
  });
}

/** A display projection only: editing and validation continue to receive the original group. */
export function visibleCompatibleParts(parts: CompatiblePartDisplay[], parent: PartDto | undefined, matchingIds?: ReadonlySet<string>, query?: string): CompatiblePartDisplay[] {
  const q = query?.trim().toLowerCase();
  if (!matchingIds || (q && parent && matchingIds.has(parent.id) && parent.partNumber.toLowerCase().includes(q))) return parts;
  const matching = parts.filter(part => part.id && matchingIds.has(part.id));
  return matching.length ? matching : parts;
}

/** Compact consecutive positions without changing, reordering or expanding the stored array. */
export function formatRelationshipPositions(row: Pick<PartRelationshipDto, "parentPositions">, parent?: PartDto): string {
  if (!row.parentPositions.length) return "All positions";
  const layout = parent?.attributes.pinIds ?? parent?.attributes.slotIds;
  const fullLayout = Array.isArray(layout) ? layout.filter((value): value is string => typeof value === "string") : [];
  return formatContactPositionList(row.parentPositions.join(", "), fullLayout);
}
