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

interface DatabaseRecords {
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

/** Search item identities, then keep complete related records in every tab. */
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
  return {
    items,
    relationships: records.relationships.filter(row => ids.has(row.parentPartId) || (
      row.targetPartIds
        ? row.targetPartIds.some(id => ids.has(id))
        : row.compatibleParts.some(partNumber => partNumbers.has(partNumber.trim().toLowerCase()))
    )),
    aliases: records.aliases.filter(row => ids.has(row.partId)),
    contactWire: records.contactWire.filter(row => ids.has(row.contactPartId) || ids.has(row.wirePartId)),
    moduleContact: records.moduleContact.filter(row => ids.has(row.modulePartId) || ids.has(row.contactPartId)),
    moduleBackshell: records.moduleBackshell.filter(row => ids.has(row.modulePartId) || ids.has(row.backshellPartId)),
    moduleStrainRelief: records.moduleStrainRelief.filter(row => ids.has(row.modulePartId) || ids.has(row.strainReliefPartId)),
    media: records.media.filter(row => ids.has(row.partId))
  };
}
