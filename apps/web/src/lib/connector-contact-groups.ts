import type { LibraryComponentDto, RevisionDto } from "./api";
import { isFrameHousingConnector, isSlotPopulated } from "./connector-frames";
import { displayPartType } from "./part-fields";

type SnapshotConnector = RevisionDto["snapshot"]["connectors"][number];
type ConnectorSlot = NonNullable<SnapshotConnector["slots"]>[number];

export type ConnectorContactGroup = {
  pinCount: number;
  contactType: string;
  gender: string;
};

export type ConnectorDetailsModule = {
  id: string;
  label: string;
  contacts: string[];
};

export type ConnectorDetailsRow = {
  id: string;
  /** Frame housing name. Absent when the connector is a single module. */
  housing?: string;
  modules: ConnectorDetailsModule[];
};

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function displayConnectorGender(...values: Array<string | undefined>): string {
  for (const value of values) {
    const label = displayPartType(value);
    if (label === "ITA" || label === "RCV") {
      return label;
    }
  }
  return "";
}

export function findCatalogComponent(
  catalog: LibraryComponentDto[],
  ref: { libraryComponentId?: string; partNumber?: string }
): LibraryComponentDto | undefined {
  if (ref.libraryComponentId) {
    const byId = catalog.find((component) => component.id === ref.libraryComponentId);
    if (byId) {
      return byId;
    }
  }
  const partNumber = ref.partNumber?.trim().toLowerCase();
  if (!partNumber) {
    return undefined;
  }
  return catalog.find((component) => component.partNumber.trim().toLowerCase() === partNumber);
}

function readGenderFromComponent(component: LibraryComponentDto | undefined): string {
  if (!component) {
    return "";
  }
  const attrs = component.attributes ?? {};
  return displayConnectorGender(asNonEmptyString(attrs.gender), component.side);
}

function contactGroupFromFields(input: {
  pinCount?: number;
  contactType?: string;
  gender: string;
}): ConnectorContactGroup | undefined {
  if (!input.pinCount) {
    return undefined;
  }
  return {
    pinCount: input.pinCount,
    contactType: input.contactType ?? "",
    gender: input.gender
  };
}

export function readModuleContactGroups(
  component: LibraryComponentDto | undefined,
  fallbackPinCount = 0
): ConnectorContactGroup[] {
  const attrs = component?.attributes ?? {};
  const gender = readGenderFromComponent(component);

  const family1 = asNonEmptyString(attrs.contactFamily1);
  const pinCount1 = asPositiveInt(attrs.pinCount);
  const family2 = asNonEmptyString(attrs.contactFamily2);
  const pinCount2 = asPositiveInt(attrs.pinCount2);
  const isMultiFamily = Boolean(family2 || pinCount2);

  if (isMultiFamily) {
    return [
      contactGroupFromFields({
        pinCount: pinCount1 ?? fallbackPinCount,
        contactType: family1,
        gender
      }),
      contactGroupFromFields({
        pinCount: pinCount2,
        contactType: family2,
        gender
      })
    ].filter((group): group is ConnectorContactGroup => Boolean(group));
  }

  const positions = Array.isArray(attrs.contactPositions) ? attrs.contactPositions : [];
  const fromPositions = positions
    .map((position) => {
      if (!position || typeof position !== "object") {
        return undefined;
      }
      const record = position as {
        pinCount?: unknown;
        contactFamily?: unknown;
        contactSize?: unknown;
      };
      return contactGroupFromFields({
        pinCount: asPositiveInt(record.pinCount),
        contactType: asNonEmptyString(record.contactFamily) ?? asNonEmptyString(record.contactSize),
        gender
      });
    })
    .filter((group): group is ConnectorContactGroup => Boolean(group));
  if (fromPositions.length > 1 || (fromPositions.length === 1 && !family1 && !pinCount1)) {
    return fromPositions;
  }

  const primary = contactGroupFromFields({
    pinCount: pinCount1 ?? fromPositions[0]?.pinCount ?? (fallbackPinCount > 0 ? fallbackPinCount : undefined),
    contactType: family1 ?? fromPositions[0]?.contactType,
    gender
  });
  return primary ? [primary] : [];
}

export function formatContactGroupLabel(group: ConnectorContactGroup): string {
  return [String(group.pinCount), group.contactType, group.gender].filter((part) => part.length > 0).join(" ");
}

function resolvedModulePartNumber(
  partNumber: string | undefined,
  component: LibraryComponentDto | undefined
): string | undefined {
  const snapshotPart = partNumber?.trim();
  if (snapshotPart) {
    return snapshotPart;
  }
  const catalogPart = component?.partNumber?.trim();
  return catalogPart || undefined;
}

function connectorDisplayName(reference: string, id: string): string {
  const name = reference.trim();
  return name || id;
}

function moduleSummaryLabel(name: string, partNumber: string | undefined, description: string | undefined): string {
  return [name, partNumber, description?.trim()].filter((part) => part && part.length > 0).join(" — ");
}

function moduleLine(input: {
  id: string;
  name: string;
  partNumber?: string;
  component: LibraryComponentDto | undefined;
  pins: Array<{ id: string; number: string }>;
}): ConnectorDetailsModule {
  const groups = readModuleContactGroups(input.component, input.pins.length);
  return {
    id: input.id,
    label: moduleSummaryLabel(
      input.name,
      resolvedModulePartNumber(input.partNumber, input.component),
      input.component?.description
    ),
    contacts: groups.length === 0 ? ["none"] : groups.map((group) => formatContactGroupLabel(group))
  };
}

export function buildConnectorDetailsRows(
  connectors: SnapshotConnector[],
  catalog: LibraryComponentDto[]
): ConnectorDetailsRow[] {
  return connectors.map((connector) => {
    const name = connectorDisplayName(connector.reference, connector.id);
    if (isFrameHousingConnector(connector)) {
      const populatedSlots = (connector.slots ?? []).filter((slot: ConnectorSlot) => isSlotPopulated(slot));
      const modules = populatedSlots.map((slot) => {
        const component = findCatalogComponent(catalog, {
          libraryComponentId: slot.libraryComponentId,
          partNumber: slot.partNumber
        });
        return moduleLine({
          id: slot.slotId,
          name: connectorDisplayName(slot.reference, slot.slotId),
          partNumber: slot.partNumber,
          component,
          pins: slot.pins
        });
      });
      return {
        id: connector.id,
        housing: name,
        modules: modules.length > 0 ? modules : [{ id: `${connector.id}:none`, label: "none", contacts: [] }]
      };
    }

    const component = findCatalogComponent(catalog, {
      libraryComponentId: connector.libraryComponentId,
      partNumber: connector.partNumber
    });
    return {
      id: connector.id,
      modules: [
        moduleLine({
          id: connector.id,
          name,
          partNumber: connector.partNumber,
          component,
          pins: connector.pins
        })
      ]
    };
  });
}
