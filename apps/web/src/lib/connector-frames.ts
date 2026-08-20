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

export function defaultSlotReference(canvasReference: string, slotId: string): string {
  return `${canvasReference}${slotId}`;
}

export function isDefaultSlotReference(reference: string, canvasReference: string, slotId: string): boolean {
  return reference === defaultSlotReference(canvasReference, slotId);
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

export function emptySlot(canvasReference: string, slotId: string): ConnectorSlot {
  return {
    slotId,
    reference: defaultSlotReference(canvasReference, slotId),
    pins: []
  };
}

export function buildSlotsForFrame(
  canvasReference: string,
  slotIds: string[],
  previousSlots: ConnectorSlot[] = []
): ConnectorSlot[] {
  const previousById = new Map(previousSlots.map((slot) => [slot.slotId, slot]));
  return slotIds.map((slotId) => previousById.get(slotId) ?? emptySlot(canvasReference, slotId));
}

export function retargetSlotReferences(
  slots: ConnectorSlot[],
  oldCanvasReference: string,
  newCanvasReference: string
): ConnectorSlot[] {
  return slots.map((slot) => {
    if (!isDefaultSlotReference(slot.reference, oldCanvasReference, slot.slotId)) {
      return slot;
    }
    return { ...slot, reference: defaultSlotReference(newCanvasReference, slot.slotId) };
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
 * Reverse-compatibility filter: with includeReverse off, only modules on the
 * frame's side (or DUAL / unspecified) are suggested for its slots.
 */
export function moduleMatchesFrameSide(
  module: { side?: string },
  frame: { side?: string } | undefined,
  includeReverse: boolean
): boolean {
  if (includeReverse) {
    return true;
  }
  const frameSide = normalizeCatalogSide(frame?.side);
  if (!frameSide || frameSide === "DUAL") {
    return true;
  }
  const moduleSide = normalizeCatalogSide(module.side);
  if (!moduleSide || moduleSide === "DUAL") {
    return true;
  }
  return moduleSide === frameSide;
}

export function modulesAllowedForFrameSlot<T extends { partNumber: string; category: string; partType?: string }>(
  framePartId: string,
  slotId: string,
  relationships: FrameModuleRelationship[],
  modules: T[]
): T[] {
  const allowedPartNumbers = new Set<string>();
  const slotNeedle = slotId.trim().toUpperCase();
  for (const relationship of relationships) {
    if (relationship.parentPartId !== framePartId) {
      continue;
    }
    if (relationship.relationshipType !== "MODULE_ALLOWED") {
      continue;
    }
    if (relationship.status !== "allowed") {
      continue;
    }
    const positions = relationship.parentPositions.map((entry) => entry.trim().toUpperCase()).filter(Boolean);
    if (positions.length > 0 && !positions.includes(slotNeedle)) {
      continue;
    }
    for (const partNumber of relationship.compatibleParts) {
      const key = partNumber.trim().toLowerCase();
      if (key) {
        allowedPartNumbers.add(key);
      }
    }
  }
  return modules.filter(
    (module) => isCanvasConnectorPart(module) && allowedPartNumbers.has(module.partNumber.trim().toLowerCase())
  );
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
        reference: slot.reference,
        partNumber: slot.partNumber,
        libraryComponentId: slot.libraryComponentId,
        pins: slot.pins,
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
  TConnector extends { slots?: Array<{ slotId: string; reference: string }> }
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
