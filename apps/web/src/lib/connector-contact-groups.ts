import type { CompatStatus, LibraryComponentDto, RevisionDto } from "./api";
import { isFrameHousingConnector, isSlotPopulated, slotModuleName } from "./connector-frames";
import { displayPartType } from "./part-fields";
import { isSimHost, type SimInsertAssignment } from "./sim-modules";

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
  /** Full module layout, used to keep omitted positions visible as gaps in ranges. */
  pinPositions: string[];
  compatibleContacts: CompatibleContact[];
};

const POSITION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type PositionSeries = {
  key: string;
  n: number;
  bank?: { key: string; row: number };
};

function unpaddedInteger(digits: string): number | undefined {
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(Number(digits)) || String(Number(digits)) !== digits) {
    return undefined;
  }
  return Number(digits);
}

function letterRow(prefix: string): number | undefined {
  if (!/^([A-Z]+|[a-z]+)$/.test(prefix)) {
    return undefined;
  }
  let row = 0;
  for (const letter of prefix.toUpperCase()) {
    row = row * 26 + letter.charCodeAt(0) - 64;
  }
  return Number.isSafeInteger(row) ? row : undefined;
}

/** A run of positions that share a prefix or suffix and increase by one, such as A1–A12 or 1A–4A. */
function positionSeries(token: string): PositionSeries | undefined {
  const integer = unpaddedInteger(token);
  if (integer !== undefined) {
    return { key: "n", n: integer };
  }

  const prefixNumber = /^([A-Za-z]+)([-_.]?)(\d+)$/.exec(token);
  if (prefixNumber) {
    const value = unpaddedInteger(prefixNumber[3] ?? "");
    if (value !== undefined) {
      const prefix = prefixNumber[1] ?? "";
      const separator = prefixNumber[2] ?? "";
      const row = letterRow(prefix);
      return {
        key: `p:${prefix}:${separator}`,
        n: value,
        bank: row !== undefined && value > 0
          ? { key: `${separator}:${prefix === prefix.toUpperCase() ? "U" : "L"}`, row }
          : undefined
      };
    }
  }

  const numberSuffix = /^(\d+)([-_.]?)([A-Za-z]+)$/.exec(token);
  if (numberSuffix) {
    const value = unpaddedInteger(numberSuffix[1] ?? "");
    if (value !== undefined) {
      const separator = numberSuffix[2] ?? "";
      const suffix = numberSuffix[3] ?? "";
      return {
        key: `s:${separator}:${suffix}`,
        n: value
      };
    }
  }

  if (/^[A-Za-z]+$/.test(token)) {
    const prefix = token.slice(0, -1);
    const last = token.slice(-1);
    const letter = last.toUpperCase().charCodeAt(0) - 65;
    if (letter >= 0 && letter <= 25 && (last === last.toUpperCase() || last === last.toLowerCase())) {
      const letterCase = last === last.toUpperCase() ? "U" : "L";
      return {
        key: `a:${prefix}:${letterCase}`,
        n: letter
      };
    }
  }

  return undefined;
}

/** Collapse consecutive positions, including row rollovers such as A40 → B1, into one range. */
export function formatContactPositionList(positions: string, modulePositions: readonly string[] = []): string {
  if (positions === "All") {
    return positions;
  }
  const tokens = Array.from(new Set(positions.split(",").map((token) => token.trim()).filter(Boolean)))
    .map((token) => ({ token, series: positionSeries(token) }))
    .sort((left, right) => {
      const leftBank = left.series?.bank;
      const rightBank = right.series?.bank;
      if (leftBank && rightBank && leftBank.key === rightBank.key) {
        return leftBank.row - rightBank.row || left.series!.n - right.series!.n;
      }
      return POSITION_COLLATOR.compare(left.token, right.token);
    });
  // Use the full module's row width when known: A1–A20 must not jump to B1 if A21–A40 exist.
  const rowWidths = new Map<string, number>();
  for (const series of [...tokens.map((token) => token.series), ...modulePositions.map(positionSeries)]) {
    if (series?.bank) {
      rowWidths.set(series.bank.key, Math.max(rowWidths.get(series.bank.key) ?? 0, series.n));
    }
  }
  const groups: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const startToken = tokens[index]!.token;
    const start = tokens[index]!.series;
    if (!start) {
      groups.push(startToken);
      index += 1;
      continue;
    }
    let end = start;
    let endToken = startToken;
    let next = index + 1;
    while (next < tokens.length) {
      const candidate = tokens[next]!.series;
      const sameRow = candidate && candidate.key === end.key && candidate.n === end.n + 1;
      const nextRow = candidate?.bank && end.bank && candidate.bank.key === end.bank.key &&
        candidate.bank.row === end.bank.row + 1 && candidate.n === 1 &&
        end.n === rowWidths.get(end.bank.key);
      if (!candidate || (!sameRow && !nextRow)) {
        break;
      }
      end = candidate;
      endToken = tokens[next]!.token;
      next += 1;
    }
    groups.push(endToken === startToken ? startToken : `${startToken}–${endToken}`);
    index = next;
  }
  return groups.join(", ");
}

export type CompatibleContactGroup = {
  description: string;
  rows: Array<{ partNumbers: string[]; awgRange: string; positions: string }>;
};

/** One description for every contact that shares it. Part numbers that also share AWG and positions share a row. */
export function groupCompatibleContacts(contacts: CompatibleContact[]): CompatibleContactGroup[] {
  const groups = new Map<string, CompatibleContactGroup>();
  for (const contact of contacts) {
    const description = contact.description.trim();
    const group = groups.get(description) ?? { description, rows: [] };
    const existing = group.rows.find((row) => row.awgRange === contact.awgRange && row.positions === contact.positions);
    if (existing) {
      existing.partNumbers.push(contact.partNumber);
    } else {
      group.rows.push({
        partNumbers: [contact.partNumber],
        awgRange: contact.awgRange,
        positions: contact.positions
      });
    }
    groups.set(description, group);
  }
  for (const group of groups.values()) {
    for (const row of group.rows) {
      row.partNumbers.sort(POSITION_COLLATOR.compare);
    }
  }
  return Array.from(groups.values());
}

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
    simInserts?: SimInsertAssignment[];
    backshellPartNumber?: string;
    strainReliefPartNumber?: string;
    frame?: ConnectorModuleEntry["frame"];
  }): ConnectorModuleEntry => {
    const component = findCatalogComponent(input.connectorCatalog, {
      libraryComponentId: module.libraryComponentId,
      partNumber: module.partNumber
    });
    const partNumber = resolvedModulePartNumber(module.partNumber, component);
    const simHost = isSimHost(component);
    const effectivePins = simHost && module.simInserts === undefined ? [] : module.pins;
    const activeInserts = (module.simInserts ?? []).filter(item => module.pins.some(pin => pin.id.startsWith(`${item.slotId}:`)));
    const groups = simHost ? activeInserts.flatMap(item => readModuleContactGroups(findCatalogComponent(input.connectorCatalog, item), item.pins.length)) : readModuleContactGroups(component, module.pins.length);
    const contacts = simHost ? activeInserts.flatMap(item => compatibleContactsForModule(item.libraryComponentId, contactCatalog, moduleContactCompat, contactRelationships).map(contact => ({
      ...contact,
      positions: (contact.positions === "All" ? item.pins.map(pin => pin.number) : contact.positions.split(",").map(pin => pin.trim())).map(pin => `${item.slotId}/${pin}`).join(", ")
    }))) : compatibleContactsForModule(module.libraryComponentId?.trim() || component?.id, contactCatalog, moduleContactCompat, contactRelationships);
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
      pinPositions: [
        ...effectivePins.map((pin) => pin.number),
        ...(!simHost && Array.isArray(component?.attributes?.pinIds)
          ? component.attributes.pinIds.filter((pin): pin is string => typeof pin === "string")
          : [])
      ],
      compatibleContacts: contacts
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
          simInserts: connector.simInserts,
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
        simInserts: slot.simInserts,
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
