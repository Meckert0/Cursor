import type { CompatStatus, LibraryComponentDto, RevisionDto } from "./api";
import { isFrameHousingConnector, isSlotPopulated, slotModuleName } from "./connector-frames";
import { displayPartType } from "./part-fields";

type SnapshotConnector = RevisionDto["snapshot"]["connectors"][number];
type ConnectorSlot = NonNullable<SnapshotConnector["slots"]>[number];

export type ConnectorContactGroup = {
  pinCount: number;
  contactType: string;
  gender: string;
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
): string {
  return partNumber?.trim() || component?.partNumber?.trim() || "";
}

function connectorDisplayName(reference: string, id: string): string {
  const name = reference.trim();
  return name || id;
}

function readAwgNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/** Accepted wire gauge range for a contact, e.g. "22-26 AWG". Empty when unknown. */
export function formatContactAwgRange(contact: LibraryComponentDto | undefined): string {
  const attrs = contact?.attributes ?? {};
  const min = readAwgNumber(attrs.acceptedAwgMin);
  const max = readAwgNumber(attrs.acceptedAwgMax);
  if (min !== undefined || max !== undefined) {
    const low = Math.min(min ?? max ?? 0, max ?? min ?? 0);
    const high = Math.max(min ?? max ?? 0, max ?? min ?? 0);
    return low === high ? `${low} AWG` : `${low}-${high} AWG`;
  }
  const awg = asNonEmptyString(attrs.awg);
  if (awg) {
    return /awg/i.test(awg) ? awg : `${awg} AWG`;
  }
  const gauges = Array.isArray(attrs.acceptedGauges)
    ? attrs.acceptedGauges.map((gauge) => String(gauge).trim()).filter((gauge) => gauge.length > 0)
    : [];
  return gauges.length > 0 ? `${gauges.join(", ")} AWG` : "";
}

export type ContactCompatRow = {
  modulePartId: string;
  contactPartId: string;
  status: CompatStatus;
};

export type ContactRelationshipRow = {
  parentPartId: string;
  compatibleParts: string[];
  relationshipType?: string;
  parentPositions: string[];
  status: CompatStatus;
};

export type CompatibleContact = {
  partNumber: string;
  description: string;
  awgRange: string;
  /** Module positions the contact may occupy. "All" when unrestricted. */
  positions: string;
  status: Exclude<CompatStatus, "forbidden">;
};

export type ConnectorModuleEntry = {
  key: string;
  designator: string;
  partNumber: string;
  description: string;
  gender: string;
  contactGroups: string[];
  /** Set when the module sits in a frame slot. */
  frame?: { reference: string; partNumber: string; slotId: string };
  backshellPartNumber: string;
  strainReliefPartNumber: string;
  /** False when the canvas has no part selected for this module. */
  moduleDefined: boolean;
  compatibleContacts: CompatibleContact[];
};

const POSITION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compatibleContactsForModule(
  modulePartId: string | undefined,
  contactCatalog: LibraryComponentDto[],
  moduleContactCompat: ContactCompatRow[],
  contactRelationships: ContactRelationshipRow[]
): CompatibleContact[] {
  if (!modulePartId) {
    return [];
  }
  const contactByPartNumber = new Map(
    contactCatalog.map((contact) => [contact.partNumber.trim().toLowerCase(), contact])
  );
  const contactById = new Map(contactCatalog.map((contact) => [contact.id, contact]));

  const relationships = contactRelationships.filter(
    (row) =>
      row.parentPartId === modulePartId &&
      (row.relationshipType ?? "CONTACT_ALLOWED").trim().toUpperCase() === "CONTACT_ALLOWED"
  );

  const merged = new Map<
    string,
    { partNumber: string; contact?: LibraryComponentDto; allPositions: boolean; positions: Set<string>; allowed: boolean }
  >();
  const add = (partNumber: string, contact: LibraryComponentDto | undefined, positions: string[], status: CompatStatus) => {
    if (status === "forbidden") {
      return;
    }
    const key = partNumber.trim().toLowerCase();
    if (!key) {
      return;
    }
    const entry = merged.get(key) ?? {
      partNumber: contact?.partNumber.trim() || partNumber.trim(),
      contact,
      allPositions: false,
      positions: new Set<string>(),
      allowed: false
    };
    const cleaned = positions.map((position) => position.trim()).filter((position) => position.length > 0);
    if (cleaned.length === 0) {
      entry.allPositions = true;
    }
    cleaned.forEach((position) => entry.positions.add(position));
    entry.allowed = entry.allowed || status === "allowed";
    merged.set(key, entry);
  };

  // Same precedence as the wirelist contact verifier: relationship rows win when a module has any.
  if (relationships.length > 0) {
    for (const row of relationships) {
      for (const partNumber of row.compatibleParts) {
        add(partNumber, contactByPartNumber.get(partNumber.trim().toLowerCase()), row.parentPositions, row.status);
      }
    }
  } else {
    for (const row of moduleContactCompat) {
      if (row.modulePartId !== modulePartId) {
        continue;
      }
      const contact = contactById.get(row.contactPartId);
      if (contact) {
        add(contact.partNumber, contact, [], row.status);
      }
    }
  }

  return Array.from(merged.values())
    .map((entry) => ({
      partNumber: entry.partNumber,
      description: entry.contact?.description?.trim() ?? "",
      awgRange: formatContactAwgRange(entry.contact),
      positions: entry.allPositions
        ? "All"
        : Array.from(entry.positions).sort(POSITION_COLLATOR.compare).join(", "),
      status: entry.allowed ? ("allowed" as const) : ("review" as const)
    }))
    .sort((left, right) => POSITION_COLLATOR.compare(left.partNumber, right.partNumber));
}

/**
 * Every canvas module as its own entry, sorted by designator. A frame contributes one
 * entry per slot; a plain connector is its own module.
 */
export function buildConnectorModuleEntries(input: {
  connectors: SnapshotConnector[];
  connectorCatalog: LibraryComponentDto[];
  contactCatalog?: LibraryComponentDto[];
  moduleContactCompat?: ContactCompatRow[];
  contactRelationships?: ContactRelationshipRow[];
}): ConnectorModuleEntry[] {
  const contactCatalog = input.contactCatalog ?? [];
  const moduleContactCompat = input.moduleContactCompat ?? [];
  const contactRelationships = input.contactRelationships ?? [];

  const entry = (module: {
    key: string;
    designator: string;
    partNumber?: string;
    libraryComponentId?: string;
    pins: Array<{ id: string; number: string }>;
    backshellPartNumber?: string;
    strainReliefPartNumber?: string;
    frame?: ConnectorModuleEntry["frame"];
  }): ConnectorModuleEntry => {
    const component = findCatalogComponent(input.connectorCatalog, {
      libraryComponentId: module.libraryComponentId,
      partNumber: module.partNumber
    });
    const partNumber = resolvedModulePartNumber(module.partNumber, component);
    const groups = readModuleContactGroups(component, module.pins.length);
    return {
      key: module.key,
      designator: module.designator,
      partNumber,
      description: component?.description?.trim() ?? "",
      gender: readGenderFromComponent(component),
      contactGroups: groups.map((group) => formatContactGroupLabel(group)),
      frame: module.frame,
      backshellPartNumber: module.backshellPartNumber?.trim() ?? "",
      strainReliefPartNumber: module.strainReliefPartNumber?.trim() ?? "",
      moduleDefined: Boolean(partNumber || module.libraryComponentId),
      compatibleContacts: compatibleContactsForModule(
        module.libraryComponentId?.trim() || component?.id,
        contactCatalog,
        moduleContactCompat,
        contactRelationships
      )
    };
  };

  const entries = input.connectors.flatMap((connector) => {
    const name = connectorDisplayName(connector.reference, connector.id);
    if (!isFrameHousingConnector(connector)) {
      return [
        entry({
          key: connector.id,
          designator: name,
          partNumber: connector.partNumber,
          libraryComponentId: connector.libraryComponentId,
          pins: connector.pins,
          backshellPartNumber: connector.backshellPartNumber,
          strainReliefPartNumber: connector.strainReliefPartNumber
        })
      ];
    }
    return (connector.slots ?? []).map((slot: ConnectorSlot) =>
      entry({
        key: `${connector.id}:${slot.slotId}`,
        designator: connectorDisplayName(slotModuleName(connector, slot), `${name}${slot.slotId}`),
        partNumber: isSlotPopulated(slot) ? slot.partNumber : undefined,
        libraryComponentId: slot.libraryComponentId,
        pins: isSlotPopulated(slot) ? slot.pins : [],
        backshellPartNumber: slot.backshellPartNumber,
        strainReliefPartNumber: slot.strainReliefPartNumber,
        frame: { reference: name, partNumber: connector.partNumber?.trim() ?? "", slotId: slot.slotId }
      })
    );
  });

  return entries.sort(
    (left, right) =>
      POSITION_COLLATOR.compare(left.designator, right.designator) || left.key.localeCompare(right.key)
  );
}
