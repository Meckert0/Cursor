import type { LibraryComponentDto, RevisionDto } from "./api";

export const WIRELIST_SLEEVING_OPTIONS = [
  "none",
  "expandable_sleeving",
  "wire_braid_under_expandable_sleeving"
] as const;

export type WirelistSleeving = (typeof WIRELIST_SLEEVING_OPTIONS)[number];

export type WirelistRow = {
  id: string;
  runNumber: string;
  fromLocation: string;
  fromContact: string;
  fromSignalDescription: string;
  wireAwg: string;
  wirePartNumber: string;
  length: string;
  wireColor: string;
  wireGroup: string;
  toLocation: string;
  toContact: string;
  toSignalDescription: string;
  labelPartNumber: string;
  labelText: string;
  notes: string;
  wireName: string;
  wireComponentId: string;
  sleeving: WirelistSleeving;
};

export const WIRELIST_TEMPLATE_HEADERS = [
  "Run #",
  "From Location (Conn - Pin)",
  "From Contact",
  "From Signal Desc",
  "Wire AWG",
  "Wire/Patchcord P/N",
  "Length (in)",
  "Wire Color",
  "Wire Group",
  "To Location (Conn-Pin)",
  "To Contact",
  "To Signal Desc",
  "Label P/N",
  "Label Text",
  "Notes"
] as const;

export type WirelistTemplateHeader = (typeof WIRELIST_TEMPLATE_HEADERS)[number];

const HEADER_ALIASES: Record<string, WirelistTemplateHeader> = {
  "run#": "Run #",
  "run #": "Run #",
  "from location (conn - pin)": "From Location (Conn - Pin)",
  "from location (conn-pin)": "From Location (Conn - Pin)",
  "from location": "From Location (Conn - Pin)",
  "from contact": "From Contact",
  "from signal desc": "From Signal Desc",
  "wire awg": "Wire AWG",
  "wire/patchcord p/n": "Wire/Patchcord P/N",
  "wire part number": "Wire/Patchcord P/N",
  "wire p/n": "Wire/Patchcord P/N",
  "length (in)": "Length (in)",
  "wire color": "Wire Color",
  "wire group": "Wire Group",
  "to location (conn-pin)": "To Location (Conn-Pin)",
  "to location (conn - pin)": "To Location (Conn-Pin)",
  "to location": "To Location (Conn-Pin)",
  "to contact": "To Contact",
  "to signal desc": "To Signal Desc",
  "label p/n": "Label P/N",
  "label text": "Label Text",
  notes: "Notes",
  id: "Run #",
  wirename: "Label Text",
  fromnodeid: "From Location (Conn - Pin)",
  tonodeid: "To Location (Conn-Pin)",
  length: "Length (in)",
  wirepartnumber: "Wire/Patchcord P/N"
};

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseRunNumber(value: string, fallbackIndex: number): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackIndex + 1;
}

function resolveConnectorId(location: string, connectorReferenceToId: Map<string, string>): string {
  const literalLocation = location.trim();
  if (!literalLocation) {
    return "";
  }
  const byReference = connectorReferenceToId.get(literalLocation.toLowerCase());
  return byReference ?? literalLocation;
}

type HeaderResolution = {
  resolved: Partial<Record<WirelistTemplateHeader, string>>;
  missing: WirelistTemplateHeader[];
};

function resolveTemplateHeaders(records: Array<Record<string, unknown>>): HeaderResolution {
  const headerKeys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      headerKeys.add(key);
    }
  }

  const resolved: Partial<Record<WirelistTemplateHeader, string>> = {};
  for (const rawHeader of headerKeys) {
    const normalized = normalizeHeader(rawHeader);
    const canonical = HEADER_ALIASES[normalized];
    if (canonical && !resolved[canonical]) {
      resolved[canonical] = rawHeader;
    }
  }

  const missing = WIRELIST_TEMPLATE_HEADERS.filter((header) => !resolved[header]);
  return { resolved, missing };
}

function getValue(
  record: Record<string, unknown>,
  resolvedHeaders: Partial<Record<WirelistTemplateHeader, string>>,
  header: WirelistTemplateHeader
): string {
  const key = resolvedHeaders[header];
  return key ? toStringValue(record[key]) : "";
}

export function snapshotToWirelistRows(snapshot: RevisionDto["snapshot"]): WirelistRow[] {
  const connectorNameById = new Map(snapshot.connectors.map((connector) => [connector.id, connector.reference]));

  return snapshot.paths.map((path, index) => ({
    id: path.id,
    runNumber: String(path.runNumber ?? index + 1),
    fromLocation: connectorNameById.get(path.fromConnectorId) ?? path.fromConnectorId,
    fromContact: path.fromContact ?? "",
    fromSignalDescription: path.fromSignalDescription ?? "",
    wireAwg: path.wireAwg ?? "",
    wirePartNumber: path.wirePartNumber ?? "",
    length: typeof path.length === "number" ? String(path.length) : "",
    wireColor: path.wireColor ?? "",
    wireGroup: path.wireGroup ?? "",
    toLocation: connectorNameById.get(path.toConnectorId) ?? path.toConnectorId,
    toContact: path.toContact ?? "",
    toSignalDescription: path.toSignalDescription ?? "",
    labelPartNumber: path.labelPartNumber ?? "",
    labelText: path.labelText ?? "",
    notes: path.notes ?? "",
    wireName: path.wireName ?? `wire${index + 1}`,
    sleeving: path.sleeving ?? "none",
    wireComponentId: path.wireComponentId ?? ""
  }));
}

export function wirelistRowsToSnapshot(
  baseline: RevisionDto["snapshot"],
  rows: WirelistRow[]
): RevisionDto["snapshot"] {
  const connectorReferenceToId = new Map(baseline.connectors.map((connector) => [connector.reference.toLowerCase(), connector.id]));

  return {
    ...baseline,
    paths: rows.map((row, index) => {
      const fromContact = row.fromContact.trim();
      const toContact = row.toContact.trim();
      const parsedLength = Number(row.length);
      const hasNumericLength = row.length.trim().length > 0 && Number.isFinite(parsedLength);
      return {
        id: row.id,
        runNumber: parseRunNumber(row.runNumber, index),
        wireName: row.wireName || `wire${index + 1}`,
        fromConnectorId: resolveConnectorId(row.fromLocation, connectorReferenceToId),
        toConnectorId: resolveConnectorId(row.toLocation, connectorReferenceToId),
        pathType: "wire",
        length: hasNumericLength ? parsedLength : undefined,
        sleeving: row.sleeving,
        wireComponentId: row.wireComponentId || undefined,
        fromContact: fromContact || undefined,
        fromSignalDescription: row.fromSignalDescription.trim() || undefined,
        wireAwg: row.wireAwg.trim() || undefined,
        wirePartNumber: row.wirePartNumber.trim() || undefined,
        wireColor: row.wireColor.trim() || undefined,
        wireGroup: row.wireGroup.trim() || undefined,
        toContact: toContact || undefined,
        toSignalDescription: row.toSignalDescription.trim() || undefined,
        labelPartNumber: row.labelPartNumber.trim() || undefined,
        labelText: row.labelText.trim() || undefined,
        notes: row.notes.trim() || undefined
      };
    })
  };
}

export function buildWirelistNodeIds(snapshot: RevisionDto["snapshot"]): string[] {
  return [
    ...snapshot.connectors.map((connector) => connector.id),
    ...snapshot.connectors.map((connector) => connector.reference),
    ...(snapshot.junctions ?? []).map((junction) => junction.id)
  ];
}

export function validateWirelistRows(rows: WirelistRow[], validNodeIds: string[]): string[] {
  void validNodeIds;
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`;

    if (!row.id.trim()) {
      errors.push(`${rowLabel}: id is required.`);
    }
    if (!row.runNumber.trim()) {
      errors.push(`${rowLabel}: Run # is required.`);
    }
  });
  return errors;
}

export type WirelistLocationState = "empty" | "valid" | "partial" | "invalid";

export type WirelistLocationVerification = {
  state: WirelistLocationState;
  message: string | null;
};

export function parseConnectorPinsField(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readPinsCustomField(customFieldValues: Record<string, string> | null | undefined): string {
  if (!customFieldValues) {
    return "";
  }
  for (const [key, value] of Object.entries(customFieldValues)) {
    if (key.trim().toLowerCase() === "pins") {
      return value ?? "";
    }
  }
  return "";
}

export function buildConnectorPositionLookup(
  connectors: Array<{ reference: string; partNumber?: string; pins: Array<{ number: string }> }>,
  connectorCatalog: Array<{ partNumber: string; customFieldValues?: Record<string, string> | null }> = []
): Map<string, Set<string>> {
  const catalogPinsByPartNumber = new Map<string, string[]>();
  for (const component of connectorCatalog) {
    const partKey = component.partNumber?.trim().toLowerCase();
    if (!partKey) {
      continue;
    }
    const parsed = parseConnectorPinsField(readPinsCustomField(component.customFieldValues));
    if (parsed.length > 0) {
      catalogPinsByPartNumber.set(partKey, parsed);
    }
  }

  const lookup = new Map<string, Set<string>>();
  for (const connector of connectors) {
    const key = connector.reference.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const partKey = connector.partNumber?.trim().toLowerCase();
    const catalogPins = partKey ? catalogPinsByPartNumber.get(partKey) : undefined;
    const positions =
      catalogPins && catalogPins.length > 0
        ? new Set(catalogPins)
        : new Set(connector.pins.map((pin) => pin.number.trim()).filter((number) => number.length > 0));
    lookup.set(key, positions);
  }
  return lookup;
}

export function verifyWirelistLocation(
  value: string,
  connectorPositions: Map<string, Set<string>>
): WirelistLocationVerification {
  const trimmed = value.trim();
  if (!trimmed) {
    return { state: "empty", message: null };
  }
  const separatorIndex = trimmed.lastIndexOf("-");
  const connector = (separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed).trim();
  const position = (separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : "").trim();
  const positions = connectorPositions.get(connector.toLowerCase());
  if (!positions) {
    return { state: "invalid", message: "Connector name does not exist" };
  }
  if (position.length > 0 && positions.has(position)) {
    return { state: "valid", message: null };
  }
  return { state: "partial", message: "Connector position not correct" };
}

export function parseImportedWirelistRows(input: {
  records: Array<Record<string, unknown>>;
  existingRows: WirelistRow[];
  wireCatalog: LibraryComponentDto[];
}): WirelistRow[] {
  const { resolved, missing } = resolveTemplateHeaders(input.records);
  if (missing.length > 0) {
    throw new Error(`Missing required wirelist column(s): ${missing.join(", ")}.`);
  }

  const byPartNumber = new Map(
    input.wireCatalog
      .filter((component) => component.category === "wire")
      .map((component) => [component.partNumber.trim().toLowerCase(), component.id])
  );
  const parsedRows = input.records.map((record, index) => {
    const existing = input.existingRows[index];
    const wirePartNumber = getValue(record, resolved, "Wire/Patchcord P/N");
    const mappedWireComponentId = wirePartNumber ? (byPartNumber.get(wirePartNumber.toLowerCase()) ?? "") : "";
    const sleevingRaw = toStringValue(record.sleeving);
    const sleeving = WIRELIST_SLEEVING_OPTIONS.includes(sleevingRaw as WirelistSleeving)
      ? (sleevingRaw as WirelistSleeving)
      : "none";
    return {
      id: existing?.id || `p_canvas_${index + 1}`,
      runNumber: getValue(record, resolved, "Run #") || existing?.runNumber || String(index + 1),
      fromLocation: getValue(record, resolved, "From Location (Conn - Pin)") || existing?.fromLocation || "",
      fromContact: getValue(record, resolved, "From Contact") || existing?.fromContact || "",
      fromSignalDescription: getValue(record, resolved, "From Signal Desc") || existing?.fromSignalDescription || "",
      wireAwg: getValue(record, resolved, "Wire AWG") || existing?.wireAwg || "",
      wirePartNumber,
      length: getValue(record, resolved, "Length (in)") || existing?.length || "",
      wireColor: getValue(record, resolved, "Wire Color") || existing?.wireColor || "",
      wireGroup: getValue(record, resolved, "Wire Group") || existing?.wireGroup || "",
      toLocation: getValue(record, resolved, "To Location (Conn-Pin)") || existing?.toLocation || "",
      toContact: getValue(record, resolved, "To Contact") || existing?.toContact || "",
      toSignalDescription: getValue(record, resolved, "To Signal Desc") || existing?.toSignalDescription || "",
      labelPartNumber: getValue(record, resolved, "Label P/N") || existing?.labelPartNumber || "",
      labelText: getValue(record, resolved, "Label Text") || existing?.labelText || "",
      notes: getValue(record, resolved, "Notes") || existing?.notes || "",
      wireName: existing?.wireName || `wire${index + 1}`,
      sleeving,
      wireComponentId: mappedWireComponentId || existing?.wireComponentId || ""
    };
  });
  return parsedRows.filter((row) =>
    [
      row.fromLocation,
      row.fromContact,
      row.fromSignalDescription,
      row.wireAwg,
      row.wirePartNumber,
      row.length,
      row.wireColor,
      row.wireGroup,
      row.toLocation,
      row.toContact,
      row.toSignalDescription,
      row.labelPartNumber,
      row.labelText,
      row.notes
    ].some((value) => value.trim().length > 0)
  );
}

export function filterPopulatedWirelistRows(rows: WirelistRow[]): WirelistRow[] {
  return rows.filter((row) =>
    [
      row.fromLocation,
      row.fromContact,
      row.fromSignalDescription,
      row.wireAwg,
      row.wirePartNumber,
      row.length,
      row.wireColor,
      row.wireGroup,
      row.toLocation,
      row.toContact,
      row.toSignalDescription,
      row.labelPartNumber,
      row.labelText,
      row.notes
    ].some((value) => value.trim().length > 0)
  );
}

export function wirelistRowsToTemplateRecords(rows: WirelistRow[]): Array<Record<WirelistTemplateHeader, string | number>> {
  return rows.map((row, index) => ({
    "Run #": parseRunNumber(row.runNumber, index),
    "From Location (Conn - Pin)": row.fromLocation,
    "From Contact": row.fromContact,
    "From Signal Desc": row.fromSignalDescription,
    "Wire AWG": row.wireAwg,
    "Wire/Patchcord P/N": row.wirePartNumber,
    "Length (in)": row.length,
    "Wire Color": row.wireColor,
    "Wire Group": row.wireGroup,
    "To Location (Conn-Pin)": row.toLocation,
    "To Contact": row.toContact,
    "To Signal Desc": row.toSignalDescription,
    "Label P/N": row.labelPartNumber,
    "Label Text": row.labelText,
    Notes: row.notes
  }));
}
