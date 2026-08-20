import { makePartId } from "../cpq-import/part-id.js";
import type {
  CompatStatus,
  ContactAttributes,
  FrameAttributes,
  LibraryCategory,
  ModuleAttributes,
  ModuleContactCompat,
  ModuleContactPosition,
  PartImportProvenance,
  PartRelationshipInput
} from "../library.js";
import {
  emptyAttributesForCategory,
  partRelationshipNaturalKey
} from "../library.js";
import type {
  VpcCatalogBuild,
  VpcCatalogIssue,
  VpcCatalogPart,
  VpcCell,
  VpcSheetRow
} from "./types.js";

const PARTS_COLUMNS = new Set([
  "part_number",
  "part_type",
  "side",
  "family",
  "description",
  "electrical_mode",
  "module_capacity",
  "position_count",
  "active",
  "notes",
  "sim_slots",
  "sim_slot_sections"
]);

const COMPAT_COLUMNS = new Set([
  "parent_part",
  "parent_positions",
  "relationship_type",
  "position_type",
  "compatible_parts",
  "quantity",
  "removable",
  "status",
  "notes",
  "wire_gauges_awg",
  "wire_cable_or_interface"
]);

const CATEGORY_BY_TYPE: Record<string, LibraryCategory> = {
  ITA: "frame",
  RECEIVER: "frame",
  MODULE: "module",
  SIM_INSERT: "module",
  CONTACT: "contact"
};

const ALLOWED_SOURCE_STATUSES = new Set([
  "CONFIRMED",
  "CONFIRMED_FAMILY",
  "FAMILY_CONFIRMED",
  "CONFIRMED_REVERSE",
  "EXCLUSIVE_CONFIRMED"
]);

type MutablePart = VpcCatalogPart & { id: string; partNumberKey: string };

function cellText(value: VpcCell | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : undefined;
}

function cellBool(value: VpcCell | undefined, fallback = true): boolean {
  const text = cellText(value);
  if (text === undefined) {
    return fallback;
  }
  const upper = text.toUpperCase();
  if (["FALSE", "0", "NO", "N"].includes(upper)) {
    return false;
  }
  if (["TRUE", "1", "YES", "Y"].includes(upper)) {
    return true;
  }
  return fallback;
}

function cellInt(value: VpcCell | undefined): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const text = cellText(value);
  if (!text) {
    return undefined;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
}

function splitList(value: VpcCell | undefined): string[] {
  const text = cellText(value);
  if (!text) {
    return [];
  }
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function unmappedColumns(rows: VpcSheetRow[], known: Set<string>): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.cells)) {
      if (!known.has(key)) {
        found.add(key);
      }
    }
  }
  return [...found].sort();
}

export function mapWorkbookStatus(sourceStatus: string | undefined): {
  status: CompatStatus;
  unknown: boolean;
} {
  const normalized = sourceStatus?.trim().toUpperCase();
  if (!normalized) {
    return { status: "review", unknown: true };
  }
  if (normalized === "CONDITIONAL_CLEARANCE") {
    return { status: "review", unknown: false };
  }
  if (ALLOWED_SOURCE_STATUSES.has(normalized)) {
    return { status: "allowed", unknown: false };
  }
  return { status: "review", unknown: true };
}

function slotIdsFromCapacity(capacity: number | undefined): string[] {
  if (!capacity || capacity <= 0) {
    return [];
  }
  return Array.from({ length: capacity }, (_, index) => String.fromCharCode(65 + index));
}

function parseSimSections(value: VpcCell | undefined): string[][] {
  const text = cellText(value);
  if (!text) {
    return [];
  }
  return text
    .split(";")
    .map((section) =>
      section
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
    .filter((section) => section.length > 0);
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function numericGauges(gauges: string[]): number[] | undefined {
  const numbers: number[] = [];
  for (const gauge of gauges) {
    if (!/^\d+(\.\d+)?$/.test(gauge)) {
      return undefined;
    }
    numbers.push(Number(gauge));
  }
  return numbers.length > 0 ? numbers : undefined;
}

function relationshipId(row: {
  parentPartId: string;
  relationshipType: string;
  positionType?: string;
  parentPositions: string[];
  status: CompatStatus;
}): string {
  const key = partRelationshipNaturalKey(row).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/g, "");
  return `rel-${key.length > 120 ? `${key.slice(0, 96)}-${simpleHash(key)}` : key}`;
}

/** Stable short hash so long pin-list keys still produce deterministic ids. */
function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function worseStatus(left: CompatStatus, right: CompatStatus): CompatStatus {
  const rank: Record<CompatStatus, number> = { allowed: 0, review: 1, forbidden: 2 };
  return rank[left] >= rank[right] ? left : right;
}

function extraFromCompat(row: {
  quantity?: number;
  removable?: boolean;
  gauges: string[];
  wireInterface?: string;
}): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  if (row.quantity !== undefined) extra.quantity = row.quantity;
  if (row.removable !== undefined) extra.removable = row.removable;
  if (row.gauges.length > 0) extra.gauges = row.gauges;
  if (row.wireInterface) extra.interface = row.wireInterface;
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function genderFromSide(side: string | undefined): string | undefined {
  if (side === "ITA" || side === "RECEIVER") {
    return side;
  }
  return undefined;
}

export function parseVpcCatalog(input: {
  parts: VpcSheetRow[];
  compatibility: VpcSheetRow[];
}): VpcCatalogBuild {
  const issues: VpcCatalogIssue[] = [];
  const partsByNumber = new Map<string, MutablePart>();
  const partsByType: Record<string, number> = {};
  const statusMapped: Record<string, number> = {};

  for (const row of input.parts) {
    const partNumber = cellText(row.cells.part_number);
    const partType = cellText(row.cells.part_type)?.toUpperCase();
    if (!partNumber) {
      issues.push({ sheet: "PARTS", row: row.row, kind: "missing-part-number", detail: "Skipped row with no part_number" });
      continue;
    }
    if (!partType || !CATEGORY_BY_TYPE[partType]) {
      issues.push({
        sheet: "PARTS",
        row: row.row,
        kind: "unknown-part-type",
        detail: `${partNumber}: part_type=${partType ?? "(empty)"}`
      });
      continue;
    }
    const category = CATEGORY_BY_TYPE[partType];
    const family = cellText(row.cells.family);
    if (!family) {
      issues.push({ sheet: "PARTS", row: row.row, kind: "missing-family", detail: partNumber });
      continue;
    }
    if (partsByNumber.has(partNumber)) {
      issues.push({
        sheet: "PARTS",
        row: row.row,
        kind: "duplicate-part-number",
        detail: partNumber
      });
      continue;
    }

    const side = cellText(row.cells.side)?.toUpperCase();
    const electricalMode = cellText(row.cells.electrical_mode)?.toUpperCase();
    const notes = cellText(row.cells.notes);
    const moduleCapacity = cellInt(row.cells.module_capacity);
    const positionCount = cellInt(row.cells.position_count);
    const simSlots = cellInt(row.cells.sim_slots);
    const simSlotSections = parseSimSections(row.cells.sim_slot_sections);
    const attributes = emptyAttributesForCategory(category);

    if (category === "frame") {
      const frame = attributes as FrameAttributes;
      frame.moduleCapacity = moduleCapacity;
      frame.slotIds = slotIdsFromCapacity(moduleCapacity);
    } else if (category === "module") {
      const module = attributes as ModuleAttributes;
      module.gender = genderFromSide(side);
      module.positionCount = positionCount;
      if (positionCount && positionCount > 0) {
        module.pinCount = positionCount;
      }
      if (partType === "SIM_INSERT") {
        module.slotOccupancy = simSlots;
      }
      if (electricalMode === "INSERT_HOST") {
        module.simSlotCount = simSlots;
        module.simSlotSections = simSlotSections;
      }
    } else if (category === "contact") {
      const contact = attributes as ContactAttributes;
      contact.gender = genderFromSide(side);
    }

    const extraAttributes: Record<string, unknown> = {};
    if (category !== "frame" && moduleCapacity !== undefined) {
      extraAttributes.moduleCapacity = moduleCapacity;
    }

    const part: MutablePart = {
      id: makePartId(category, partNumber),
      category,
      family,
      partNumber,
      description: cellText(row.cells.description) ?? partNumber,
      isActive: cellBool(row.cells.active, true),
      stockStatus: "unknown",
      isReviewed: true,
      partType,
      side,
      notes,
      electricalMode,
      extraAttributes: Object.keys(extraAttributes).length > 0 ? extraAttributes : undefined,
      attributes,
      sourceRow: row.row,
      partNumberKey: partNumber
    };
    partsByNumber.set(partNumber, part);
    partsByType[partType] = (partsByType[partType] ?? 0) + 1;
  }

  const grouped = new Map<string, PartRelationshipInput & { compatibleParts: string[] }>();
  let explodedPairCount = 0;
  const pinIdsByModule = new Map<string, string[]>();
  const contactPositionsByModule = new Map<string, Map<string, ModuleContactPosition>>();
  const slotIdsByFrame = new Map<string, string[]>();
  const gaugesByContact = new Map<string, { gauges: string[]; wireInterface?: string }>();
  const moduleContactByKey = new Map<string, ModuleContactCompat>();

  for (const row of input.compatibility) {
    const parentPn = cellText(row.cells.parent_part);
    const relationshipType = cellText(row.cells.relationship_type)?.toUpperCase();
    const sourceStatus = cellText(row.cells.status)?.toUpperCase();
    statusMapped[sourceStatus ?? "(empty)"] = (statusMapped[sourceStatus ?? "(empty)"] ?? 0) + 1;
    if (!parentPn || !relationshipType) {
      issues.push({
        sheet: "COMPATIBILITY",
        row: row.row,
        kind: "incomplete-row",
        detail: `parent_part=${parentPn ?? "(empty)"} relationship_type=${relationshipType ?? "(empty)"}`
      });
      continue;
    }
    const parent = partsByNumber.get(parentPn);
    if (!parent) {
      issues.push({
        sheet: "COMPATIBILITY",
        row: row.row,
        kind: "orphan-parent",
        detail: parentPn
      });
      continue;
    }

    const mapped = mapWorkbookStatus(sourceStatus);
    if (mapped.unknown) {
      issues.push({
        sheet: "COMPATIBILITY",
        row: row.row,
        kind: "unknown-status",
        detail: `${parentPn} ${relationshipType} status=${sourceStatus ?? "(empty)"}`
      });
    }

    const parentPositions = splitList(row.cells.parent_positions);
    const positionType = cellText(row.cells.position_type)?.toUpperCase();
    const children = splitList(row.cells.compatible_parts);
    const gauges = splitList(row.cells.wire_gauges_awg);
    const wireInterface = cellText(row.cells.wire_cable_or_interface);
    const quantity = cellInt(row.cells.quantity);
    const removableRaw = cellText(row.cells.removable);
    const removable =
      removableRaw === undefined ? undefined : cellBool(row.cells.removable, false);
    const notes = cellText(row.cells.notes);

    if (relationshipType === "MODULE_ALLOWED" && parent.category === "frame") {
      slotIdsByFrame.set(parent.id, uniqueInOrder([...(slotIdsByFrame.get(parent.id) ?? []), ...parentPositions]));
    }
    if (relationshipType === "CONTACT_ALLOWED" && parent.category === "module") {
      pinIdsByModule.set(parent.id, uniqueInOrder([...(pinIdsByModule.get(parent.id) ?? []), ...parentPositions]));
      if (positionType && parentPositions.length > 0) {
        const bySize = contactPositionsByModule.get(parent.id) ?? new Map<string, ModuleContactPosition>();
        const existing = bySize.get(positionType);
        bySize.set(positionType, {
          contactSize: positionType,
          pinCount: (existing?.pinCount ?? 0) + parentPositions.length
        });
        contactPositionsByModule.set(parent.id, bySize);
      }
    }
    if (relationshipType === "WIRE_COMPATIBILITY" && parent.category === "contact") {
      gaugesByContact.set(parent.id, { gauges, wireInterface });
    }

    if (children.length === 0 && relationshipType !== "WIRE_COMPATIBILITY") {
      issues.push({
        sheet: "COMPATIBILITY",
        row: row.row,
        kind: "missing-children",
        detail: `${parentPn} ${relationshipType}`
      });
      continue;
    }

    const compatibleParts: string[] = [];
    for (const childPn of children) {
      const child = partsByNumber.get(childPn);
      if (!child) {
        issues.push({
          sheet: "COMPATIBILITY",
          row: row.row,
          kind: "orphan-child",
          detail: `${parentPn} → ${childPn} (${relationshipType})`
        });
        continue;
      }
      compatibleParts.push(childPn);
      explodedPairCount += 1;
      if (relationshipType === "CONTACT_ALLOWED" && parent.category === "module") {
        const pairKey = `${parent.id}::${child.id}`;
        const existingPair = moduleContactByKey.get(pairKey);
        if (!existingPair) {
          moduleContactByKey.set(pairKey, {
            modulePartId: parent.id,
            contactPartId: child.id,
            status: mapped.status,
            notes,
            source: "vpc-catalog"
          });
        } else {
          existingPair.status = worseStatus(existingPair.status, mapped.status);
        }
      }
    }
    if (children.length > 0 && compatibleParts.length === 0) {
      continue;
    }
    if (relationshipType === "WIRE_COMPATIBILITY" && compatibleParts.length === 0) {
      explodedPairCount += 1;
    }

    const rel: PartRelationshipInput & { compatibleParts: string[] } = {
      parentPartId: parent.id,
      compatibleParts,
      relationshipType,
      positionType,
      parentPositions,
      status: mapped.status,
      sourceStatus,
      notes,
      extra: extraFromCompat({ quantity, removable, gauges, wireInterface })
    };
    rel.id = relationshipId(rel);

    const key = partRelationshipNaturalKey(rel);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, rel);
      continue;
    }
    existing.compatibleParts = uniqueInOrder([...existing.compatibleParts, ...rel.compatibleParts]);
    if (rel.notes && rel.notes !== existing.notes) {
      existing.notes = [existing.notes, rel.notes].filter(Boolean).join(" | ");
    }
    existing.extra = { ...(existing.extra ?? {}), ...(rel.extra ?? {}) };
    issues.push({
      sheet: "COMPATIBILITY",
      kind: "merged-relationship",
      detail: key
    });
  }

  for (const part of partsByNumber.values()) {
    if (part.category === "frame") {
      const frame = part.attributes as FrameAttributes;
      const fromCompat = slotIdsByFrame.get(part.id);
      if (fromCompat && fromCompat.length > 0) {
        frame.slotIds = fromCompat;
      }
    }
    if (part.category === "module") {
      const module = part.attributes as ModuleAttributes;
      const pinIds = pinIdsByModule.get(part.id);
      if (pinIds) {
        module.pinIds = pinIds;
      }
      const positions = contactPositionsByModule.get(part.id);
      if (positions) {
        module.contactPositions = [...positions.values()];
      }
    }
    if (part.category === "contact") {
      const contact = part.attributes as ContactAttributes;
      const wire = gaugesByContact.get(part.id);
      if (wire) {
        contact.acceptedGauges = wire.gauges;
        contact.wireInterface = wire.wireInterface;
        const numeric = numericGauges(wire.gauges);
        if (numeric) {
          contact.acceptedAwgMin = Math.min(...numeric);
          contact.acceptedAwgMax = Math.max(...numeric);
        }
      }
    }
  }

  const provenance: PartImportProvenance[] = [];
  for (const part of partsByNumber.values()) {
    provenance.push({
      partId: part.id,
      sourceSheet: "PARTS",
      sourceRow: part.sourceRow,
      note: `${part.partType} ${part.partNumber}`
    });
  }
  for (const row of input.compatibility) {
    const parentPn = cellText(row.cells.parent_part);
    const parent = parentPn ? partsByNumber.get(parentPn) : undefined;
    if (!parent) {
      continue;
    }
    provenance.push({
      partId: parent.id,
      sourceSheet: "COMPATIBILITY",
      sourceRow: row.row,
      note: [
        cellText(row.cells.relationship_type),
        cellText(row.cells.status),
        cellText(row.cells.compatible_parts) ?? cellText(row.cells.wire_gauges_awg)
      ]
        .filter(Boolean)
        .join(" | ")
    });
  }

  const relationships = [...grouped.values()];
  const relationshipsByType: Record<string, number> = {};
  for (const row of relationships) {
    relationshipsByType[row.relationshipType] = (relationshipsByType[row.relationshipType] ?? 0) + 1;
  }

  return {
    parts: [...partsByNumber.values()].sort((a, b) => a.partNumber.localeCompare(b.partNumber)),
    relationships,
    moduleContactCompat: [...moduleContactByKey.values()],
    provenance,
    issues,
    unmappedColumns: {
      PARTS: unmappedColumns(input.parts, PARTS_COLUMNS),
      COMPATIBILITY: unmappedColumns(input.compatibility, COMPAT_COLUMNS)
    },
    stats: {
      partsByType,
      relationshipsByType,
      statusMapped,
      explodedCompatRows: explodedPairCount,
      sourceCompatRows: input.compatibility.length,
      sourcePartRows: input.parts.length
    }
  };
}
