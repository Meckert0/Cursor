import { compatibilityStatus } from "../../../../src/domain/compatibility-rules";
import { includesStrainRelief } from "../../../../src/domain/blank-strain-relief-compatibility";
import { isBlankModule } from "../../../../src/domain/library";
import { isCanvasConnectorPart } from "./part-fields";
import type { RevisionDto } from "./api";

type SnapshotConnector = RevisionDto["snapshot"]["connectors"][number];
type ConnectorSlot = NonNullable<SnapshotConnector["slots"]>[number];
type ConnectorPin = SnapshotConnector["pins"][number];

export type FrameAttributesLike = {
  moduleCapacity?: number;
  slotIds?: string[];
};

export type FrameModuleRelationship = {
  parentPartId: string;
  compatibleParts: string[];
  targetPartIds?: string[];
  isExhaustive?: boolean;
  unresolvedParts?: string[];
  relationshipType: string;
  parentPositions: string[];
  status: string;
};

export type LogicalConnector = {
  canvasId: string;
  slotId?: string;
  reference: string;
  partNumber?: string;
  libraryComponentId?: string;
  pins: ConnectorPin[];
  simInserts?: SnapshotConnector["simInserts"];
  backshellPartNumber?: string;
  backshellLibraryComponentId?: string;
  strainReliefPartNumber?: string;
  strainReliefLibraryComponentId?: string;
};

export function isFrameHousingConnector(connector: { slots?: ConnectorSlot[] }): boolean {
  return Array.isArray(connector.slots);
}

export function slotIdsForFrame(attributes: FrameAttributesLike | undefined): string[] {
  const named = (attributes?.slotIds ?? []).map((id) => String(id).trim()).filter((id) => id.length > 0);
  if (named.length > 0) {
    return named;
  }
  const capacity = attributes?.moduleCapacity;
  if (!capacity || capacity <= 0) {
    return [];
  }
  return Array.from({ length: capacity }, (_, index) => String.fromCharCode(65 + index));
}

export function defaultSlotReference(canvasReference: string, slotId: string, slotCount = 2): string {
  if (slotCount === 1) {
    return canvasReference;
  }
  return `${canvasReference}${slotId}`;
}

export function isDefaultSlotReference(
  reference: string,
  canvasReference: string,
  slotId: string,
  slotCount = 2
): boolean {
  return reference === defaultSlotReference(canvasReference, slotId, slotCount);
}

/** A one-slot frame's module is addressed by the connector name. */
export function slotModuleName(
  connector: { reference: string; slots?: readonly unknown[] },
  slot: { reference: string }
): string {
  if ((connector.slots?.length ?? 0) === 1) {
    return connector.reference;
  }
  return slot.reference;
}

export function namespacedPinId(slotId: string, pinId: string): string {
  return `${slotId}:${pinId}`;
}

export function parseNamespacedPinId(pinId: string): { slotId: string; pinId: string } | null {
  const separatorIndex = pinId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === pinId.length - 1) {
    return null;
  }
  return {
    slotId: pinId.slice(0, separatorIndex),
    pinId: pinId.slice(separatorIndex + 1)
  };
}

export function flattenFramePins(slots: ConnectorSlot[]): ConnectorPin[] {
  return slots.flatMap((slot) => {
    if (!slot.libraryComponentId && !slot.partNumber) {
      return [];
    }
    return slot.pins.map((pin) => ({
      id: namespacedPinId(slot.slotId, pin.id),
      number: pin.number
    }));
  });
}

export function emptySlot(canvasReference: string, slotId: string, slotCount = 2): ConnectorSlot {
  return {
    slotId,
    reference: defaultSlotReference(canvasReference, slotId, slotCount),
    pins: []
  };
}

export function buildSlotsForFrame(
  canvasReference: string,
  slotIds: string[],
  previousSlots: ConnectorSlot[] = []
): ConnectorSlot[] {
  const slotCount = slotIds.length;
  const previousById = new Map(previousSlots.map((slot) => [slot.slotId, slot]));
  return slotIds.map((slotId) => {
    const previous = previousById.get(slotId);
    if (!previous) {
      return emptySlot(canvasReference, slotId, slotCount);
    }
    if (slotCount === 1) {
      return { ...previous, reference: canvasReference };
    }
    return previous;
  });
}

export function retargetSlotReferences(
  slots: ConnectorSlot[],
  oldCanvasReference: string,
  newCanvasReference: string
): ConnectorSlot[] {
  const slotCount = slots.length;
  return slots.map((slot) => {
    if (slotCount === 1) {
      return { ...slot, reference: newCanvasReference };
    }
    if (!isDefaultSlotReference(slot.reference, oldCanvasReference, slot.slotId, slotCount)) {
      return slot;
    }
    return { ...slot, reference: defaultSlotReference(newCanvasReference, slot.slotId, slotCount) };
  });
}

export function normalizeSingleSlotReferences<T extends { reference: string; slots?: ConnectorSlot[] }>(
  connectors: T[]
): T[] {
  return connectors.map((connector) => {
    const slots = connector.slots;
    if (!slots || slots.length !== 1) {
      return connector;
    }
    const slot = slots[0];
    if (!slot || slot.reference === connector.reference) {
      return connector;
    }
    return {
      ...connector,
      slots: [{ ...slot, reference: connector.reference }]
    };
  });
}

export function usedConnectorReferences(connectors: Array<{ reference: string; slots?: ConnectorSlot[] }>): Set<string> {
  const used = new Set<string>();
  for (const connector of connectors) {
    const canvasRef = connector.reference.trim().toLowerCase();
    if (canvasRef) {
      used.add(canvasRef);
    }
    for (const slot of connector.slots ?? []) {
      const slotRef = slot.reference.trim().toLowerCase();
      if (slotRef) {
        used.add(slotRef);
      }
    }
  }
  return used;
}

export type CatalogSide = "ITA" | "RECEIVER" | "DUAL" | "";

export function normalizeCatalogSide(side?: string): CatalogSide {
  const normalized = (side ?? "").trim().toUpperCase();
  if (normalized === "ITA") {
    return "ITA";
  }
  if (normalized === "RECEIVER" || normalized === "RCV") {
    return "RECEIVER";
  }
  if (normalized === "DUAL") {
    return "DUAL";
  }
  return "";
}

/**
 * Frame-side module filter.
 * With reverseOnly off, only same-side modules (or DUAL / unspecified) are suggested.
 * With reverseOnly on, only opposite-side modules are suggested.
 */
export function moduleMatchesFrameSide(
  module: { side?: string },
  frame: { side?: string } | undefined,
  reverseOnly: boolean
): boolean {
  const frameSide = normalizeCatalogSide(frame?.side);
  const moduleSide = normalizeCatalogSide(module.side);
  if (reverseOnly) {
    if (!frameSide || frameSide === "DUAL" || !moduleSide || moduleSide === "DUAL") {
      return false;
    }
    return moduleSide !== frameSide;
  }
  if (!frameSide || frameSide === "DUAL") {
    return true;
  }
  if (!moduleSide || moduleSide === "DUAL") {
    return true;
  }
  return moduleSide === frameSide;
}

export function modulesAllowedForFrameSlot<T extends { id?: string; partNumber: string; category: string; partType?: string; family?: string; description?: string; electricalMode?: string; attributes?: unknown }>(
  framePartId: string, slotId: string, relationships: FrameModuleRelationship[], modules: T[], frame?: { category: string; description: string }
): T[] {
  return modules.filter(module => isCanvasConnectorPart(module) &&
    !(frame && includesStrainRelief(frame) && isBlankModule({ ...module, family: module.family ?? "", description: module.description ?? "" })) && compatibilityStatus({
    rules: relationships, parentPartId: framePartId, relationshipType: "MODULE_ALLOWED",
    targetPartId: module.id, targetPartNumber: module.partNumber, position: slotId, requireAllowance: true
  }) === "allowed");
}

export function expandConnectorsForDetails(connectors: SnapshotConnector[]): LogicalConnector[] {
  const result: LogicalConnector[] = [];
  for (const connector of connectors) {
    if (!isFrameHousingConnector(connector)) {
      result.push({
        canvasId: connector.id,
        reference: connector.reference,
        partNumber: connector.partNumber,
        libraryComponentId: connector.libraryComponentId,
        pins: connector.pins,
        simInserts: connector.simInserts,
        backshellPartNumber: connector.backshellPartNumber,
        backshellLibraryComponentId: connector.backshellLibraryComponentId,
        strainReliefPartNumber: connector.strainReliefPartNumber,
        strainReliefLibraryComponentId: connector.strainReliefLibraryComponentId
      });
      continue;
    }
    for (const slot of connector.slots ?? []) {
      result.push({
        canvasId: connector.id,
        slotId: slot.slotId,
        reference: slotModuleName(connector, slot),
        partNumber: slot.partNumber,
        libraryComponentId: slot.libraryComponentId,
        pins: slot.pins,
        simInserts: slot.simInserts,
        backshellPartNumber: slot.backshellPartNumber,
        backshellLibraryComponentId: slot.backshellLibraryComponentId,
        strainReliefPartNumber: slot.strainReliefPartNumber,
        strainReliefLibraryComponentId: slot.strainReliefLibraryComponentId
      });
    }
  }
  return result;
}

export function findSlotByReference<
  TConnector extends { reference?: string; slots?: Array<{ slotId: string; reference: string }> }
>(
  connectors: TConnector[],
  reference: string
): { connector: TConnector; slot: NonNullable<TConnector["slots"]>[number] } | undefined {
  const needle = reference.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  for (const connector of connectors) {
    for (const slot of connector.slots ?? []) {
      if (slot.reference.trim().toLowerCase() === needle) {
        return { connector, slot };
      }
    }
  }
  for (const connector of connectors) {
    const slots = connector.slots ?? [];
    if (slots.length === 1 && (connector.reference ?? "").trim().toLowerCase() === needle) {
      const slot = slots[0];
      if (slot) {
        return { connector, slot };
      }
    }
  }
  return undefined;
}

export function slotForPinId(connector: SnapshotConnector, pinId: string): ConnectorSlot | undefined {
  const parsed = parseNamespacedPinId(pinId);
  if (!parsed) {
    return undefined;
  }
  return connector.slots?.find((slot) => slot.slotId === parsed.slotId);
}

export function isSlotPopulated(slot: ConnectorSlot): boolean {
  return Boolean(slot.libraryComponentId || slot.partNumber?.trim());
}

export function frameAttributesFromComponent(component: {
  attributes?: Record<string, unknown> | null;
}): FrameAttributesLike {
  const attributes = component.attributes ?? {};
  const moduleCapacity =
    typeof attributes.moduleCapacity === "number" ? attributes.moduleCapacity : undefined;
  const slotIds = Array.isArray(attributes.slotIds)
    ? attributes.slotIds.map((entry) => String(entry))
    : undefined;
  return { moduleCapacity, slotIds };
}
