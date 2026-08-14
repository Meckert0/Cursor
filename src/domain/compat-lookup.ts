import type {
  CompatStatus,
  ContactWireCompat,
  ModuleBackshellCompat,
  ModuleContactCompat,
  ModuleStrainReliefCompat
} from "./library.js";

export interface CompatLookup {
  contactWire(contactPartId: string, wirePartId: string): CompatStatus | undefined;
  moduleContact(modulePartId: string, contactPartId: string): CompatStatus | undefined;
  moduleBackshell(modulePartId: string, backshellPartId: string): CompatStatus | undefined;
  moduleStrainRelief(modulePartId: string, strainReliefPartId: string): CompatStatus | undefined;
}

function pairKey(left: string, right: string): string {
  return `${left}\0${right}`;
}

export function createCompatLookup(input: {
  contactWire?: ContactWireCompat[];
  moduleContact?: ModuleContactCompat[];
  moduleBackshell?: ModuleBackshellCompat[];
  moduleStrainRelief?: ModuleStrainReliefCompat[];
}): CompatLookup {
  const contactWire = new Map<string, CompatStatus>();
  for (const row of input.contactWire ?? []) {
    contactWire.set(pairKey(row.contactPartId, row.wirePartId), row.status);
  }
  const moduleContact = new Map<string, CompatStatus>();
  for (const row of input.moduleContact ?? []) {
    moduleContact.set(pairKey(row.modulePartId, row.contactPartId), row.status);
  }
  const moduleBackshell = new Map<string, CompatStatus>();
  for (const row of input.moduleBackshell ?? []) {
    moduleBackshell.set(pairKey(row.modulePartId, row.backshellPartId), row.status);
  }
  const moduleStrainRelief = new Map<string, CompatStatus>();
  for (const row of input.moduleStrainRelief ?? []) {
    moduleStrainRelief.set(pairKey(row.modulePartId, row.strainReliefPartId), row.status);
  }

  return {
    contactWire(contactPartId, wirePartId) {
      return contactWire.get(pairKey(contactPartId, wirePartId));
    },
    moduleContact(modulePartId, contactPartId) {
      return moduleContact.get(pairKey(modulePartId, contactPartId));
    },
    moduleBackshell(modulePartId, backshellPartId) {
      return moduleBackshell.get(pairKey(modulePartId, backshellPartId));
    },
    moduleStrainRelief(modulePartId, strainReliefPartId) {
      return moduleStrainRelief.get(pairKey(modulePartId, strainReliefPartId));
    }
  };
}
