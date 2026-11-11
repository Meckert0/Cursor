import { compatibilityStatus } from "./compatibility-rules.ts";
import type { ConnectorPin, SimInsertAssignment } from "./types.js";

export interface SimPart {
  id: string;
  category: string;
  partNumber: string;
  partType?: string;
  electricalMode?: string;
  side?: string;
  attributes?: unknown;
}

/** iSeries mating-face dimensions and slot groups from VPC customer drawings. */
export interface SimModuleProfile {
  name: string;
  bankSizes: number[];
  layout: "rows" | "i2mx";
  lengthMm?: number;
  widthMm?: number;
  drawingUrl: string;
}

const icon = { name: "iCon / i1", bankSizes: [8, 8], layout: "rows" as const, lengthMm: 56.13, widthMm: 12.45 };
const i2mx = { name: "i2 MX", bankSizes: [5, 5, 1], layout: "i2mx" as const };
const profiles: Record<string, SimModuleProfile> = {
  "510160130": { ...icon, drawingUrl: "https://www.vpc.com/resources/files/510160130-pdf/" },
  "510161130": { ...icon, drawingUrl: "https://www.vpc.com/resources/files/510161130-pdf/" },
  "510143001": { ...i2mx, drawingUrl: "https://www.vpc.com/resources/files/510143001-pdf/" },
  "510144001": { ...i2mx, drawingUrl: "https://www.vpc.com/resources/files/510144001-pdf/" }
};

export function simModuleProfile(part: { category: string; partType?: string; partNumber: string } | undefined): SimModuleProfile | undefined {
  if (part?.category !== "module" || part.partType?.trim().toUpperCase() === "SIM_INSERT") return undefined;
  const partNumber = part.partNumber.trim();
  return Object.hasOwn(profiles, partNumber) ? profiles[partNumber] : undefined;
}

/** Split a complete bank list without renaming saved slot or pin IDs. */
function simProfileBanks(profile: SimModuleProfile | undefined, slots: string[]): string[][] {
  if (!profile || slots.length !== profile.bankSizes.reduce((sum, count) => sum + count, 0)) return [slots];
  let offset = 0;
  return profile.bankSizes.map(count => { const bank = slots.slice(offset, offset + count); offset += count; return bank; });
}

export interface SimRelationship {
  parentPartId: string;
  relationshipType: string;
  compatibleParts: string[];
  targetPartIds?: string[];
  isExhaustive?: boolean;
  unresolvedParts?: string[];
  parentPositions: string[];
  status: string;
}

const key = (value: string) => value.trim().toUpperCase();
const attrs = (part: SimPart | undefined): Record<string, unknown> =>
  part?.attributes && typeof part.attributes === "object" ? part.attributes as Record<string, unknown> : {};
const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

export function isSimInsert(part: SimPart | undefined): boolean {
  return part?.category === "module" && key(part.partType ?? "") === "SIM_INSERT";
}

export function isSimHost(part: SimPart | undefined): boolean {
  return part?.category === "module" && !isSimInsert(part) && (
    key(part.electricalMode ?? "") === "INSERT_HOST" || !!positive(attrs(part).simSlotCount) || !!simModuleProfile(part) ||
    (Array.isArray(attrs(part).simSlotSections) && (attrs(part).simSlotSections as unknown[]).length > 0)
  );
}

export function simSlotSections(part: SimPart | undefined): string[][] {
  if (!isSimHost(part)) return [];
  const sections = attrs(part).simSlotSections;
  const seen = new Set<string>();
  if (Array.isArray(sections)) {
    const named = sections.filter(Array.isArray).map(section => section
      .filter((slot): slot is string => typeof slot === "string")
      .map(slot => slot.trim()).filter(slot => {
        if (!slot || seen.has(key(slot))) return false;
        seen.add(key(slot)); return true;
      })).filter(section => section.length > 0);
    if (named.length) return named.length === 1 ? simProfileBanks(simModuleProfile(part), named[0]) : named;
  }
  const profile = simModuleProfile(part);
  const count = positive(attrs(part).simSlotCount) ?? (profile ? profile.bankSizes.reduce((sum, count) => sum + count, 0) : 0);
  return count ? simProfileBanks(profile, Array.from({ length: count }, (_, index) => String(index + 1))) : [];
}

export const simSlotIds = (part: SimPart | undefined): string[] => simSlotSections(part).flat();
export function simSlotCapacity(part: SimPart | undefined): number {
  const profile = simModuleProfile(part);
  return positive(attrs(part).simSlotCount) ?? (profile ? profile.bankSizes.reduce((sum, count) => sum + count, 0) : simSlotIds(part).length);
}
export const simInsertOccupancy = (part: SimPart): number => positive(attrs(part).slotOccupancy) ?? 1;

export function simPlacement(host: SimPart, slotId: string, insert: SimPart): string[] | null {
  if (!isSimInsert(insert)) return null;
  const section = simSlotSections(host).find(group => group.some(slot => key(slot) === key(slotId)));
  if (!section) return null;
  const start = section.findIndex(slot => key(slot) === key(slotId));
  const occupied = section.slice(start, start + simInsertOccupancy(insert));
  return occupied.length === simInsertOccupancy(insert) ? occupied : null;
}

export function simInsertAllowed(host: SimPart, insert: SimPart, occupied: string[], relationships: SimRelationship[]): boolean {
  const side = (value?: string) => key(value ?? "") === "RCV" ? "RECEIVER" : key(value ?? "");
  const hostSide = side(host.side), insertSide = side(insert.side);
  if (hostSide && insertSide && hostSide !== "DUAL" && insertSide !== "DUAL" && hostSide !== insertSide) return false;
  return occupied.length > 0 && occupied.every(slot => compatibilityStatus({
    rules: relationships, parentPartId: host.id, relationshipType: "INSERT_ALLOWED",
    targetPartId: insert.id, targetPartNumber: insert.partNumber, position: slot, requireAllowance: true
  }) === "allowed");
}

export function availableSimInserts<T extends SimPart>(host: SimPart, slotId: string, assignments: SimInsertAssignment[], parts: T[], relationships: SimRelationship[]): T[] {
  const taken = new Set(assignments.filter(item => key(item.slotId) !== key(slotId)).flatMap(item => item.occupiedSlotIds.map(key)));
  return parts.filter(part => {
    const occupied = simPlacement(host, slotId, part);
    return occupied && occupied.every(slot => !taken.has(key(slot))) && simInsertAllowed(host, part, occupied, relationships);
  });
}

export function simAssignmentValid(host: SimPart | undefined, assignment: SimInsertAssignment, assignments: SimInsertAssignment[], parts: SimPart[], relationships: SimRelationship[]): boolean {
  if (!host) return false;
  if (assignments.filter(item => key(item.slotId) === key(assignment.slotId)).length !== 1) return false;
  const insert = parts.find(part => part.id === assignment.libraryComponentId);
  if (!insert) return false;
  const occupied = simPlacement(host, assignment.slotId, insert);
  return !!occupied && occupied.map(key).join("|") === assignment.occupiedSlotIds.map(key).join("|") &&
    availableSimInserts(host, assignment.slotId, assignments, [insert], relationships).length > 0;
}

export function catalogModulePins(part: SimPart): ConnectorPin[] {
  const attributes = attrs(part);
  if (Array.isArray(attributes.pinIds) && attributes.pinIds.length) {
    return attributes.pinIds.map(pin => ({ id: String(pin), number: String(pin) }));
  }
  const count = positive(attributes.positionCount) ?? ((positive(attributes.pinCount) ?? 0) + (positive(attributes.pinCount2) ?? 0));
  return Array.from({ length: count }, (_, index) => ({ id: String(index + 1), number: String(index + 1) }));
}

export function flattenSimPins(assignments: SimInsertAssignment[]): ConnectorPin[] {
  return assignments.flatMap(item => item.pins.map(pin => ({ id: `${item.slotId}:${pin.id}`, number: `${item.slotId}/${pin.number}` })));
}

export function usableSimPins(host: SimPart, assignments: SimInsertAssignment[], parts: SimPart[], relationships: SimRelationship[]): ConnectorPin[] {
  return flattenSimPins(assignments.filter(item => simAssignmentValid(host, item, assignments, parts, relationships)));
}
