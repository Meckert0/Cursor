import type {
  ContactWireCompatDto,
  ModuleBackshellCompatDto,
  ModuleContactCompatDto,
  ModuleStrainReliefCompatDto,
  PartAliasDto,
  PartDto,
  PartMediaDto,
  PartRelationshipDto
} from "@/lib/api";

export interface DatabaseRecords {
  items: PartDto[];
  relationships: PartRelationshipDto[];
  aliases: PartAliasDto[];
  contactWire: ContactWireCompatDto[];
  moduleContact: ModuleContactCompatDto[];
  moduleBackshell: ModuleBackshellCompatDto[];
  moduleStrainRelief: ModuleStrainReliefCompatDto[];
  media: PartMediaDto[];
}

export function databaseFamilies(items: PartDto[]): string[] {
  const families = new Map<string, string>();
  for (const item of items) {
    const family = item.family.trim();
    if (family && !families.has(family.toLowerCase())) families.set(family.toLowerCase(), family);
  }
  return [...families.values()].sort((left, right) => left.localeCompare(right));
}

/** Search item identities; matching target categories take precedence over broad parent descriptions. */
export function searchDatabase(records: DatabaseRecords, input: { q?: string; family?: string }): DatabaseRecords {
  const q = input.q?.trim().toLowerCase();
  const family = input.family?.trim().toLowerCase();
  if (!q && !family) return records;

  const items = records.items.filter(item =>
    (!family || item.family.trim().toLowerCase() === family) &&
    (!q || `${item.partNumber} ${item.description} ${item.family} ${item.partType ?? ""} ${item.side ?? ""} ${item.notes ?? ""}`.toLowerCase().includes(q))
  );
  const ids = new Set(items.map(item => item.id));
  const partNumbers = new Set(items.map(item => item.partNumber.trim().toLowerCase()));
  const byId = new Map(records.items.map(item => [item.id, item]));
  const byNumber = new Map<string, PartDto[]>();
  for (const item of records.items) {
    const key = item.partNumber.trim().toLowerCase();
    byNumber.set(key, [...(byNumber.get(key) ?? []), item]);
  }
  const matchingCategories = new Set(items.map(item => item.category));
  const parentContextMatches = (parentId: string, targets: Array<PartDto | undefined>) => {
    if (!ids.has(parentId)) return false;
    const parent = byId.get(parentId);
    // Part-number lookups retain the whole part's context. Other searches prefer
    // matching targets when their category has results, avoiding unrelated hybrid groups.
    return Boolean(q && parent?.partNumber.toLowerCase().includes(q)) ||
      !targets.some(target => target && matchingCategories.has(target.category));
  };
  const pairMatches = (left: string, right: string) =>
    (ids.has(left) && ids.has(right)) ||
    parentContextMatches(left, [byId.get(right)]) || parentContextMatches(right, [byId.get(left)]);
  return {
    items,
    relationships: records.relationships.filter(row => {
      if (row.targetPartIds) {
        return row.targetPartIds.some(id => ids.has(id)) ||
          parentContextMatches(row.parentPartId, row.targetPartIds.map(id => byId.get(id)));
      }
      return row.compatibleParts.some(partNumber => partNumbers.has(partNumber.trim().toLowerCase())) ||
        parentContextMatches(row.parentPartId, row.compatibleParts.flatMap(partNumber => byNumber.get(partNumber.trim().toLowerCase()) ?? []));
    }),
    aliases: records.aliases.filter(row => ids.has(row.partId)),
    contactWire: records.contactWire.filter(row => pairMatches(row.contactPartId, row.wirePartId)),
    moduleContact: records.moduleContact.filter(row => pairMatches(row.modulePartId, row.contactPartId)),
    moduleBackshell: records.moduleBackshell.filter(row => pairMatches(row.modulePartId, row.backshellPartId)),
    moduleStrainRelief: records.moduleStrainRelief.filter(row => pairMatches(row.modulePartId, row.strainReliefPartId)),
    media: records.media.filter(row => ids.has(row.partId))
  };
}
