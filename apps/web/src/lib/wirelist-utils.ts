import type { LibraryComponentDto, RevisionDto } from "./api";
import {
  mergeSnapshotPaths,
  partitionSnapshotPaths
} from "./path-roles";
import { buildConnectorPairTotals } from "./cable-canvas-utils";

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

type ConnectorCatalogEntry = {
  partNumber: string;
  attributes?: Record<string, unknown> | null;
};

const HEADER_ALIASES: Record<string, WirelistTemplateHeader | "Sleeving"> = {
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
  sleeving: "Sleeving",
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

export type ParsedWirelistLocation = {
  connectorRef: string;
  pinNumber: string;
};

export function parseWirelistLocation(value: string): ParsedWirelistLocation {
  const trimmed = value.trim();
  if (!trimmed) {
    return { connectorRef: "", pinNumber: "" };
  }
  const separatorIndex = trimmed.lastIndexOf("-");
  if (separatorIndex < 0) {
    return { connectorRef: trimmed, pinNumber: "" };
  }
  return {
    connectorRef: trimmed.slice(0, separatorIndex).trim(),
    pinNumber: trimmed.slice(separatorIndex + 1).trim()
  };
}

export function formatWirelistLocation(reference: string, pinNumber: string): string {
  const ref = reference.trim();
  const pin = pinNumber.trim();
  if (!ref) {
    return "";
  }
  if (!pin) {
    return ref;
  }
  return `${ref} - ${pin}`;
}

type SnapshotConnector = RevisionDto["snapshot"]["connectors"][number];
type SnapshotJunction = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];
type SnapshotPinMapping = RevisionDto["snapshot"]["pinMappings"][number];

export type ResolvedWirelistEndpoint = {
  nodeId: string;
  pinId: string;
  kind: "connector" | "junction" | "unresolved";
};

function buildEndpointLookups(snapshot: Pick<RevisionDto["snapshot"], "connectors" | "junctions">) {
  const connectorByReference = new Map<string, SnapshotConnector>();
  const connectorById = new Map<string, SnapshotConnector>();
  for (const connector of snapshot.connectors) {
    connectorByReference.set(connector.reference.trim().toLowerCase(), connector);
    connectorById.set(connector.id.trim().toLowerCase(), connector);
  }
  const junctionById = new Map<string, SnapshotJunction>();
  for (const junction of snapshot.junctions ?? []) {
    junctionById.set(junction.id.trim().toLowerCase(), junction);
  }
  return { connectorByReference, connectorById, junctionById };
}

function readModulePinIds(attributes: Record<string, unknown> | null | undefined): string[] {
  if (!attributes) {
    return [];
  }
  const pinIds = attributes.pinIds;
  if (!Array.isArray(pinIds)) {
    return [];
  }
  return pinIds.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function buildCatalogPinsByPartNumber(
  connectorCatalog: ConnectorCatalogEntry[] = []
): Map<string, string[]> {
  const catalogPinsByPartNumber = new Map<string, string[]>();
  for (const component of connectorCatalog) {
    const partKey = component.partNumber?.trim().toLowerCase();
    if (!partKey) {
      continue;
    }
    const pinIds = readModulePinIds(component.attributes);
    if (pinIds.length > 0) {
      catalogPinsByPartNumber.set(partKey, pinIds);
    }
  }
  return catalogPinsByPartNumber;
}

function catalogPinsForConnector(
  connector: SnapshotConnector,
  catalogPinsByPartNumber: Map<string, string[]>
): string[] {
  const partKey = connector.partNumber?.trim().toLowerCase();
  if (!partKey) {
    return [];
  }
  return catalogPinsByPartNumber.get(partKey) ?? [];
}

function resolvePinId(
  connector: SnapshotConnector,
  pinNumber: string,
  catalogPinsByPartNumber: Map<string, string[]> = new Map()
): string {
  const needle = pinNumber.trim().toLowerCase();
  if (!needle) {
    return "";
  }
  const byNumber = connector.pins.find((pin) => pin.number.trim().toLowerCase() === needle);
  if (byNumber) {
    return byNumber.id;
  }
  const byId = connector.pins.find((pin) => pin.id.trim().toLowerCase() === needle);
  if (byId) {
    return byId.id;
  }
  const catalogPins = catalogPinsForConnector(connector, catalogPinsByPartNumber);
  const catalogMatch = catalogPins.find((pin) => pin.toLowerCase() === needle);
  return catalogMatch ?? "";
}

export function resolveWirelistEndpoint(
  location: string,
  snapshot: Pick<RevisionDto["snapshot"], "connectors" | "junctions">,
  connectorCatalog: ConnectorCatalogEntry[] = []
): ResolvedWirelistEndpoint {
  const { connectorRef, pinNumber } = parseWirelistLocation(location);
  if (!connectorRef) {
    return { nodeId: "", pinId: "", kind: "unresolved" };
  }

  const { connectorByReference, connectorById, junctionById } = buildEndpointLookups(snapshot);
  const catalogPinsByPartNumber = buildCatalogPinsByPartNumber(connectorCatalog);
  const key = connectorRef.toLowerCase();

  // Prefer an exact connector reference match so "J1" stays a connector even when a
  // junction id lowercases to the same key (e.g. junction "j1").
  const exactConnector = snapshot.connectors.find(
    (connector) => connector.reference.trim() === connectorRef || connector.id.trim() === connectorRef
  );
  if (exactConnector) {
    return {
      nodeId: exactConnector.id,
      pinId: resolvePinId(exactConnector, pinNumber, catalogPinsByPartNumber),
      kind: "connector"
    };
  }

  const junction = junctionById.get(key) ?? snapshot.junctions?.find((entry) => entry.id.trim() === connectorRef);
  if (junction) {
    return { nodeId: junction.id, pinId: "", kind: "junction" };
  }

  const connector = connectorByReference.get(key) ?? connectorById.get(key);
  if (connector) {
    return {
      nodeId: connector.id,
      pinId: resolvePinId(connector, pinNumber, catalogPinsByPartNumber),
      kind: "connector"
    };
  }

  // Preserve raw ID passthrough for unknown literals (legacy / in-progress edits).
  return { nodeId: connectorRef, pinId: "", kind: "unresolved" };
}

function formatEndpointFromMapping(
  connectorId: string,
  pinId: string,
  connectorById: Map<string, SnapshotConnector>,
  junctionById: Map<string, SnapshotJunction>
): string {
  const connector = connectorById.get(connectorId);
  if (connector) {
    const pin = connector.pins.find((entry) => entry.id === pinId);
    return formatWirelistLocation(connector.reference, pin?.number ?? pinId);
  }
  const junction = junctionById.get(connectorId);
  if (junction) {
    return junction.label?.trim() || junction.id;
  }
  return connectorId;
}

type HeaderResolution = {
  resolved: Partial<Record<WirelistTemplateHeader | "Sleeving", string>>;
  missing: WirelistTemplateHeader[];
};

function resolveTemplateHeaders(records: Array<Record<string, unknown>>): HeaderResolution {
  const headerKeys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      headerKeys.add(key);
    }
  }

  const resolved: Partial<Record<WirelistTemplateHeader | "Sleeving", string>> = {};
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
  resolvedHeaders: Partial<Record<WirelistTemplateHeader | "Sleeving", string>>,
  header: WirelistTemplateHeader | "Sleeving"
): string {
  const key = resolvedHeaders[header];
  return key ? toStringValue(record[key]) : "";
}

export function snapshotToWirelistRows(snapshot: RevisionDto["snapshot"]): WirelistRow[] {
  const connectorById = new Map(snapshot.connectors.map((connector) => [connector.id, connector]));
  const junctionById = new Map((snapshot.junctions ?? []).map((junction) => [junction.id, junction]));
  const pinMappingByPathId = new Map(snapshot.pinMappings.map((mapping) => [mapping.pathId, mapping]));
  const { wireRunPaths } = partitionSnapshotPaths(snapshot.paths, snapshot.pinMappings);

  return wireRunPaths.map((path, index) => {
    const mapping = pinMappingByPathId.get(path.id);
    let fromLocation = formatEndpointFromMapping(path.fromConnectorId, "", connectorById, junctionById);
    let toLocation = formatEndpointFromMapping(path.toConnectorId, "", connectorById, junctionById);

    if (mapping) {
      const forward =
        mapping.fromConnectorId === path.fromConnectorId && mapping.toConnectorId === path.toConnectorId;
      const reverse =
        mapping.fromConnectorId === path.toConnectorId && mapping.toConnectorId === path.fromConnectorId;
      if (forward) {
        fromLocation = formatEndpointFromMapping(
          mapping.fromConnectorId,
          mapping.fromPinId,
          connectorById,
          junctionById
        );
        toLocation = formatEndpointFromMapping(
          mapping.toConnectorId,
          mapping.toPinId,
          connectorById,
          junctionById
        );
      } else if (reverse) {
        fromLocation = formatEndpointFromMapping(
          mapping.toConnectorId,
          mapping.toPinId,
          connectorById,
          junctionById
        );
        toLocation = formatEndpointFromMapping(
          mapping.fromConnectorId,
          mapping.fromPinId,
          connectorById,
          junctionById
        );
      }
    }

    const storedFromLocation = path.fromLocation;
    const storedToLocation = path.toLocation;
    const hasStoredFrom = storedFromLocation !== undefined && storedFromLocation !== "";
    const hasStoredTo = storedToLocation !== undefined && storedToLocation !== "";

    return {
      id: path.id,
      runNumber: String(path.runNumber ?? index + 1),
      fromLocation: hasStoredFrom ? storedFromLocation : fromLocation,
      fromContact: path.fromContact ?? "",
      fromSignalDescription: path.fromSignalDescription ?? "",
      wireAwg: path.wireAwg ?? "",
      wirePartNumber: path.wirePartNumber ?? "",
      length: typeof path.length === "number" ? String(path.length) : "",
      wireColor: path.wireColor ?? "",
      wireGroup: path.wireGroup ?? "",
      toLocation: hasStoredTo ? storedToLocation : toLocation,
      toContact: path.toContact ?? "",
      toSignalDescription: path.toSignalDescription ?? "",
      labelPartNumber: path.labelPartNumber ?? "",
      labelText: path.labelText ?? "",
      notes: path.notes ?? "",
      wireName: path.wireName ?? `wire${index + 1}`,
      sleeving: path.sleeving ?? "none",
      wireComponentId: path.wireComponentId ?? ""
    };
  });
}

export function wirelistRowsToSnapshot(
  baseline: RevisionDto["snapshot"],
  rows: WirelistRow[],
  connectorCatalog: ConnectorCatalogEntry[] = []
): RevisionDto["snapshot"] {
  const existingMappingByPathId = new Map(baseline.pinMappings.map((mapping) => [mapping.pathId, mapping]));
  const pinMappings: SnapshotPinMapping[] = [];
  const { cablePaths } = partitionSnapshotPaths(baseline.paths, baseline.pinMappings);

  const wireRunPaths = rows.map((row, index) => {
    const fromContact = row.fromContact.trim();
    const toContact = row.toContact.trim();
    const parsedLength = Number(row.length);
    const hasNumericLength = row.length.trim().length > 0 && Number.isFinite(parsedLength);
    const fromEndpoint = resolveWirelistEndpoint(row.fromLocation, baseline, connectorCatalog);
    const toEndpoint = resolveWirelistEndpoint(row.toLocation, baseline, connectorCatalog);

    if (
      fromEndpoint.kind === "connector" &&
      toEndpoint.kind === "connector" &&
      fromEndpoint.pinId &&
      toEndpoint.pinId
    ) {
      const existing = existingMappingByPathId.get(row.id);
      pinMappings.push({
        id: existing?.id ?? `pm_${row.id}`,
        pathId: row.id,
        fromConnectorId: fromEndpoint.nodeId,
        fromPinId: fromEndpoint.pinId,
        toConnectorId: toEndpoint.nodeId,
        toPinId: toEndpoint.pinId,
        mappingType: fromEndpoint.nodeId === toEndpoint.nodeId ? "loopback" : "one_to_one"
      });
    }

    return {
      id: row.id,
      runNumber: parseRunNumber(row.runNumber, index),
      wireName: row.wireName || `wire${index + 1}`,
      fromConnectorId: fromEndpoint.nodeId,
      toConnectorId: toEndpoint.nodeId,
      pathType: "wire",
      wirelistManaged: true,
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
      notes: row.notes.trim() || undefined,
      fromLocation: row.fromLocation || undefined,
      toLocation: row.toLocation || undefined
    };
  });

  const wireRunIds = new Set(wireRunPaths.map((path) => path.id));
  const preservedCablePaths = cablePaths.filter((path) => !wireRunIds.has(path.id));

  return {
    ...baseline,
    paths: mergeSnapshotPaths(preservedCablePaths, wireRunPaths),
    pinMappings
  };
}

export function buildWirelistNodeIds(snapshot: RevisionDto["snapshot"]): string[] {
  return [
    ...snapshot.connectors.map((connector) => connector.id),
    ...snapshot.connectors.map((connector) => connector.reference),
    ...(snapshot.junctions ?? []).map((junction) => junction.id)
  ];
}

function validateWirelistLocationField(
  fieldLabel: string,
  value: string,
  validNodes: Set<string>,
  connectorsByRefOrId: Map<string, SnapshotConnector>,
  connectorPositions: Map<string, Set<string>>
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const { connectorRef, pinNumber } = parseWirelistLocation(trimmed);
  if (!connectorRef) {
    return `${fieldLabel} is invalid.`;
  }
  const key = connectorRef.toLowerCase();
  if (!validNodes.has(key)) {
    return `${fieldLabel} references unknown connector "${connectorRef}".`;
  }
  if (pinNumber) {
    const positions = connectorPositions.get(key);
    const connector = connectorsByRefOrId.get(key);
    if (positions && !positions.has(pinNumber)) {
      const ref = connector?.reference ?? connectorRef;
      return `${fieldLabel} pin "${pinNumber}" not found on connector ${ref}.`;
    }
  }
  return null;
}

type ValidateWirelistRowsOptions = {
  includeLocationValidation?: boolean;
};

export function validateWirelistRows(
  rows: WirelistRow[],
  validNodeIds: string[],
  connectors: SnapshotConnector[] = [],
  connectorCatalog: ConnectorCatalogEntry[] = [],
  topology: Pick<RevisionDto["snapshot"], "connectors" | "junctions" | "paths" | "pinMappings"> | null = null,
  options: ValidateWirelistRowsOptions = {}
): string[] {
  const includeLocationValidation = options.includeLocationValidation ?? true;
  const validNodes = new Set(
    validNodeIds.map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0)
  );
  const connectorsByRefOrId = new Map<string, SnapshotConnector>();
  for (const connector of connectors) {
    connectorsByRefOrId.set(connector.reference.trim().toLowerCase(), connector);
    connectorsByRefOrId.set(connector.id.trim().toLowerCase(), connector);
  }
  const connectorPositions = buildConnectorPositionLookup(connectors, connectorCatalog);
  const connectorPairTotals =
    topology === null
      ? []
      : buildConnectorPairTotals({
          connectors: topology.connectors,
          junctions: topology.junctions ?? [],
          paths: partitionSnapshotPaths(topology.paths, topology.pinMappings).cablePaths
        });
  const cablePathCount =
    topology === null ? 0 : partitionSnapshotPaths(topology.paths, topology.pinMappings).cablePaths.length;

  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`;

    if (!row.id.trim()) {
      errors.push(`${rowLabel}: id is required.`);
    }
    if (!row.runNumber.trim()) {
      errors.push(`${rowLabel}: Run # is required.`);
    }

    if (includeLocationValidation) {
      const fromError = validateWirelistLocationField(
        `${rowLabel}: From Location`,
        row.fromLocation,
        validNodes,
        connectorsByRefOrId,
        connectorPositions
      );
      if (fromError) {
        errors.push(fromError);
      }

      const toError = validateWirelistLocationField(
        `${rowLabel}: To Location`,
        row.toLocation,
        validNodes,
        connectorsByRefOrId,
        connectorPositions
      );
      if (toError) {
        errors.push(toError);
      }
    }

    if (
      includeLocationValidation &&
      topology &&
      cablePathCount > 0 &&
      row.fromLocation.trim() &&
      row.toLocation.trim()
    ) {
      const fromEndpoint = resolveWirelistEndpoint(row.fromLocation, topology, connectorCatalog);
      const toEndpoint = resolveWirelistEndpoint(row.toLocation, topology, connectorCatalog);
      if (
        fromEndpoint.kind === "connector" &&
        toEndpoint.kind === "connector" &&
        !connectorPairTotals.some(
          (total) =>
            (total.fromConnectorId === fromEndpoint.nodeId && total.toConnectorId === toEndpoint.nodeId) ||
            (total.fromConnectorId === toEndpoint.nodeId && total.toConnectorId === fromEndpoint.nodeId)
        )
      ) {
        errors.push(
          `${rowLabel}: No cable route exists between the selected connectors on the canvas.`
        );
      }
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

export function buildConnectorPositionLookup(
  connectors: Array<{ reference: string; partNumber?: string; pins: Array<{ number: string }> }>,
  connectorCatalog: ConnectorCatalogEntry[] = []
): Map<string, Set<string>> {
  const catalogPinsByPartNumber = buildCatalogPinsByPartNumber(connectorCatalog);

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
  const { connectorRef: connector, pinNumber: position } = parseWirelistLocation(trimmed);
  const positions = connectorPositions.get(connector.toLowerCase());
  if (!positions) {
    return { state: "invalid", message: "Connector name does not exist" };
  }
  if (position.length > 0 && positions.has(position)) {
    return { state: "valid", message: null };
  }
  return { state: "partial", message: "Connector position not correct" };
}

export type WirelistContactCompatRow = {
  modulePartId: string;
  contactPartId: string;
  status: "allowed" | "forbidden" | "review";
};

function findConnectorForLocation(
  location: string,
  connectors: Array<{ id: string; reference: string; libraryComponentId?: string }>
): { id: string; reference: string; libraryComponentId?: string } | undefined {
  const { connectorRef } = parseWirelistLocation(location);
  if (!connectorRef) {
    return undefined;
  }
  const exact = connectors.find(
    (connector) => connector.reference.trim() === connectorRef || connector.id.trim() === connectorRef
  );
  if (exact) {
    return exact;
  }
  const key = connectorRef.toLowerCase();
  return connectors.find(
    (connector) => connector.reference.trim().toLowerCase() === key || connector.id.trim().toLowerCase() === key
  );
}

export function verifyWirelistContact(
  contactValue: string,
  locationValue: string,
  connectors: Array<{ id: string; reference: string; libraryComponentId?: string }>,
  contactCatalog: Array<{ id: string; partNumber: string }>,
  moduleContactCompat: WirelistContactCompatRow[]
): WirelistLocationVerification {
  const trimmedContact = contactValue.trim();
  if (!trimmedContact) {
    return { state: "empty", message: null };
  }
  const contact = contactCatalog.find(
    (entry) => entry.partNumber.trim().toLowerCase() === trimmedContact.toLowerCase()
  );
  if (!contact) {
    return { state: "invalid", message: "Contact part number not found" };
  }
  const connector = findConnectorForLocation(locationValue, connectors);
  const modulePartId = connector?.libraryComponentId?.trim();
  if (!modulePartId) {
    return { state: "partial", message: "Connector module is not defined" };
  }
  const compat = moduleContactCompat.find(
    (row) => row.modulePartId === modulePartId && row.contactPartId === contact.id
  );
  if (!compat) {
    return { state: "empty", message: null };
  }
  if (compat.status === "allowed") {
    return { state: "valid", message: null };
  }
  if (compat.status === "forbidden") {
    return { state: "invalid", message: "Contact is not compatible with this module" };
  }
  return { state: "partial", message: "Contact compatibility requires review" };
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
    const sleevingRaw = getValue(record, resolved, "Sleeving") || toStringValue(record.sleeving);
    const sleeving = WIRELIST_SLEEVING_OPTIONS.includes(sleevingRaw as WirelistSleeving)
      ? (sleevingRaw as WirelistSleeving)
      : existing?.sleeving ?? "none";
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
