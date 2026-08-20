import type { LibraryComponentDto, RevisionDto } from "./api";
import {
  isCableSectionPath,
  mergeSnapshotPaths,
  normalizePathType,
  partitionSnapshotPaths,
  pinMappedPathIds
} from "./path-roles";

type NodePosition = {
  x: number;
  y: number;
};

type Connector = RevisionDto["snapshot"]["connectors"][number];
type Path = RevisionDto["snapshot"]["paths"][number];
type Junction = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];

export type CanvasLocalDraft = {
  connectors: Connector[];
  junctions: Junction[];
  paths: Path[];
  positions: Record<string, NodePosition>;
  dirty?: boolean;
  updatedAt?: string;
};

export function canvasDraftStorageKey(revisionId: string): string {
  return `cable-canvas-draft:${revisionId}`;
}

export function canvasLayoutStorageKey(revisionId: string): string {
  return `cable-canvas-layout:${revisionId}`;
}

export function buildDefaultPositions(
  connectors: Connector[],
  junctions: Junction[]
): Record<string, NodePosition> {
  const result: Record<string, NodePosition> = {};
  connectors.forEach((connector, index) => {
    if (connector.location) {
      result[connector.id] = {
        x: connector.location.x,
        y: connector.location.y
      };
      return;
    }
    result[connector.id] = {
      x: 60 + (index % 4) * 170,
      y: 60 + Math.floor(index / 4) * 120
    };
  });
  junctions.forEach((junction, index) => {
    if (junction.location) {
      result[junction.id] = {
        x: junction.location.x,
        y: junction.location.y
      };
      return;
    }
    result[junction.id] = {
      x: 130 + (index % 5) * 140,
      y: 140 + Math.floor(index / 5) * 100
    };
  });
  return result;
}

export function buildSnapshotFromCanvas(
  baseline: RevisionDto["snapshot"],
  input: {
    connectors: Connector[];
    junctions: Junction[];
    paths: Path[];
    positions: Record<string, NodePosition>;
  }
): RevisionDto["snapshot"] {
  const { wireRunPaths: baselineWireRuns } = partitionSnapshotPaths(baseline.paths, baseline.pinMappings);
  const wireRunIds = new Set(baselineWireRuns.map((path) => path.id));
  const cablePaths = input.paths
    .filter((path) => !wireRunIds.has(path.id))
    .map((path) => ({
      ...path,
      pathType: "cable" as const
    }));
  const wireRunPaths = baselineWireRuns;
  const mergedPaths = mergeSnapshotPaths(cablePaths, wireRunPaths);
  const pathIds = new Set(mergedPaths.map((path) => path.id));
  const connectorIds = new Set(input.connectors.map((connector) => connector.id));
  const pinsByConnector = new Map(
    input.connectors.map((connector) => [connector.id, new Set(connector.pins.map((pin) => pin.id))])
  );

  return {
    ...baseline,
    connectors: input.connectors.map((connector) => ({
      ...connector,
      location: input.positions[connector.id] ?? connector.location
    })),
    junctions: input.junctions.map((junction) => ({
      ...junction,
      location: input.positions[junction.id] ?? junction.location
    })),
    paths: mergedPaths,
    pinMappings: baseline.pinMappings.filter((mapping) => {
      if (!pathIds.has(mapping.pathId)) {
        return false;
      }
      if (!connectorIds.has(mapping.fromConnectorId) || !connectorIds.has(mapping.toConnectorId)) {
        return false;
      }
      const fromPins = pinsByConnector.get(mapping.fromConnectorId);
      const toPins = pinsByConnector.get(mapping.toConnectorId);
      return Boolean(fromPins?.has(mapping.fromPinId) && toPins?.has(mapping.toPinId));
    }),
    bundles: baseline.bundles.map((bundle) => ({
      ...bundle,
      pathIds: bundle.pathIds.filter((pathId) => pathIds.has(pathId))
    })),
    annotations: baseline.annotations
  };
}

export function writeCanvasLocalDraft(revisionId: string, draft: CanvasLocalDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(canvasDraftStorageKey(revisionId), JSON.stringify(draft));
}

function readRawCanvasLocalDraft(revisionId: string): Partial<CanvasLocalDraft> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const rawDraft = window.localStorage.getItem(canvasDraftStorageKey(revisionId));
    return rawDraft ? (JSON.parse(rawDraft) as Partial<CanvasLocalDraft>) : null;
  } catch {
    return null;
  }
}

function loadLegacyLayoutPositions(revisionId: string): Record<string, NodePosition> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(canvasLayoutStorageKey(revisionId));
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, NodePosition>;
  } catch {
    return {};
  }
}

export function loadInitialCanvasDraft(
  revisionId: string,
  snapshot: RevisionDto["snapshot"]
): CanvasLocalDraft & { recoveredDirty: boolean } {
  const serverConnectors = normalizeUnassignedConnectors(snapshot.connectors);
  const serverJunctions = snapshot.junctions ?? [];
  const serverPaths = normalizePathsWithWireDefaults(snapshot.paths, snapshot.pinMappings);
  const { cablePaths } = partitionSnapshotPaths(serverPaths, snapshot.pinMappings);
  const serverPositions = buildDefaultPositions(serverConnectors, serverJunctions);
  const draft = readRawCanvasLocalDraft(revisionId);
  const hasLegacyDirtyFlag = draft !== null && draft.dirty === undefined;
  const recoveredDirty = Boolean(draft && (draft.dirty === true || hasLegacyDirtyFlag));

  if (!recoveredDirty) {
    return {
      connectors: serverConnectors,
      junctions: serverJunctions,
      paths: cablePaths,
      positions: serverPositions,
      dirty: false,
      recoveredDirty: false
    };
  }

  const connectors = normalizeUnassignedConnectors(
    Array.isArray(draft?.connectors) ? draft.connectors : serverConnectors
  );
  const junctions = Array.isArray(draft?.junctions) ? draft.junctions : serverJunctions;
  const draftPaths = Array.isArray(draft?.paths)
    ? normalizePathsWithWireDefaults(draft.paths, snapshot.pinMappings)
    : cablePaths;
  const paths = draftPaths.filter((path) => isCableSectionPath(path, pinMappedPathIds(snapshot.pinMappings)));
  const draftPositions =
    draft?.positions && typeof draft.positions === "object" ? draft.positions : {};
  const legacyLayoutPositions = loadLegacyLayoutPositions(revisionId);

  return {
    connectors,
    junctions,
    paths,
    positions: {
      ...buildDefaultPositions(connectors, junctions),
      ...legacyLayoutPositions,
      ...draftPositions
    },
    dirty: true,
    updatedAt: draft?.updatedAt,
    recoveredDirty: true
  };
}

export const SLEEVING_OPTIONS = [
  { value: "none", label: "no sleeving" },
  { value: "expandable_sleeving", label: "expandable sleeving" },
  { value: "wire_braid_under_expandable_sleeving", label: "wire braid under expandable sleeving" }
] as const;

export type SleevingValue = (typeof SLEEVING_OPTIONS)[number]["value"];

export function getSleevingLabel(value: SleevingValue): string {
  return SLEEVING_OPTIONS.find((option) => option.value === value)?.label ?? "no sleeving";
}

export function parsePinCount(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function buildConnectorPins(count: number): Connector["pins"] {
  if (count <= 0) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    const pinNumber = String(index + 1);
    return { id: pinNumber, number: pinNumber };
  });
}

export function readPinCountFromComponent(component: LibraryComponentDto): number | null {
  const attrs = component.attributes as { pinCount?: unknown; pinIds?: unknown } | undefined;
  if (typeof attrs?.pinCount === "number" && Number.isInteger(attrs.pinCount) && attrs.pinCount > 0) {
    return attrs.pinCount;
  }
  if (Array.isArray(attrs?.pinIds) && attrs.pinIds.length > 0) {
    return attrs.pinIds.length;
  }
  return null;
}

export function buildConnectorPinsFromComponent(component: LibraryComponentDto): Connector["pins"] {
  const attrs = component.attributes as { pinIds?: unknown } | undefined;
  if (Array.isArray(attrs?.pinIds) && attrs.pinIds.length > 0) {
    return attrs.pinIds.map((pinId) => {
      const number = String(pinId);
      return { id: number, number };
    });
  }
  return buildConnectorPins(readPinCountFromComponent(component) ?? 0);
}

export type AccessoryCompatStatus = "allowed" | "forbidden" | "review" | undefined;

export type RankedAccessoryOption = {
  component: LibraryComponentDto;
  status: AccessoryCompatStatus;
  /** Sort rank: allowed=0, unset=1, review=2, forbidden=3 */
  rank: number;
  label: string;
};

/**
 * Rank accessory catalog options for a selected module using junction status.
 * Forbidden options stay selectable but are labeled and sorted last.
 */
export function rankAccessoryOptionsForModule(
  accessories: LibraryComponentDto[],
  modulePartId: string | undefined,
  statusByAccessoryId: Map<string, "allowed" | "forbidden" | "review">
): RankedAccessoryOption[] {
  const rankFor = (status: AccessoryCompatStatus): number => {
    if (status === "allowed") return 0;
    if (status === undefined) return 1;
    if (status === "review") return 2;
    return 3;
  };
  return accessories
    .map((component) => {
      const status = modulePartId ? statusByAccessoryId.get(component.id) : undefined;
      const suffix =
        status === "forbidden" ? " (forbidden)" : status === "review" ? " (review)" : status === "allowed" ? " (allowed)" : "";
      return {
        component,
        status,
        rank: rankFor(status),
        label: `${component.partNumber}${component.description ? ` — ${component.description}` : ""}${suffix}`
      };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.component.partNumber.localeCompare(right.component.partNumber);
    });
}

export type AllowedAccessoryOption = {
  component: LibraryComponentDto;
  label: string;
};

/**
 * Return only accessories explicitly marked allowed for the selected module.
 * When no module is defined, returns an empty list.
 */
export function filterAllowedAccessoryOptionsForModule(
  accessories: LibraryComponentDto[],
  modulePartId: string | undefined,
  statusByAccessoryId: Map<string, "allowed" | "forbidden" | "review">
): AllowedAccessoryOption[] {
  if (!modulePartId) {
    return [];
  }
  return accessories
    .filter((component) => statusByAccessoryId.get(component.id) === "allowed")
    .map((component) => ({
      component,
      label: `${component.partNumber}${component.description ? ` — ${component.description}` : ""}`
    }))
    .sort((left, right) => left.component.partNumber.localeCompare(right.component.partNumber));
}

export function formatConnectorPinsLabel(connector: {
  id?: string;
  reference?: string;
  partNumber?: string;
  pins: Array<{ id: string; number: string }>;
}): string {
  if (!connector.partNumber || connector.pins.length === 0) {
    return "none";
  }
  const count = connector.pins.length;
  return count === 1 ? "1 pin available" : `${count} pins available`;
}

export function normalizeUnassignedConnectors(connectors: Connector[]): Connector[] {
  return connectors.map((connector) => {
    if (connector.partNumber) {
      return connector;
    }
    return { ...connector, pins: [] };
  });
}

export function normalizePathsWithWireDefaults(
  paths: RevisionDto["snapshot"]["paths"],
  pinMappings: RevisionDto["snapshot"]["pinMappings"] = []
): RevisionDto["snapshot"]["paths"] {
  const mappedPathIds = pinMappedPathIds(pinMappings);
  return paths.map((path, index) => {
    const pathType = normalizePathType(path, mappedPathIds);
    return {
      ...path,
      pathType,
      wireName:
        path.wireName ??
        (pathType === "cable" ? `cable${index + 1}` : `wire${index + 1}`),
      sleeving: path.sleeving ?? "none"
    };
  });
}

export function readCanvasDraftSnapshot(
  revisionId: string,
  snapshot: RevisionDto["snapshot"]
): Pick<RevisionDto["snapshot"], "connectors" | "junctions" | "paths"> {
  const loaded = loadInitialCanvasDraft(revisionId, snapshot);
  return {
    connectors: loaded.connectors,
    junctions: loaded.junctions,
    paths: loaded.paths
  };
}

export type UniqueWireSection = {
  pathId: string;
  wireName: string;
  fromNodeId: string;
  toNodeId: string;
  lengthFt: number;
  sleeving: "none" | "expandable_sleeving" | "wire_braid_under_expandable_sleeving";
  wireComponentId?: string;
};

export type ConnectorPairTotal = {
  fromConnectorId: string;
  toConnectorId: string;
  totalLengthFt: number;
  hopCount: number;
};

export function normalizeSelectedPathId(paths: Path[], currentPathId: string): string {
  return paths.some((path) => path.id === currentPathId) ? currentPathId : (paths[0]?.id ?? "");
}

export function normalizePathEndpointSelection(
  connectors: Connector[],
  fromId: string,
  toId: string
): { fromId: string; toId: string } {
  const connectorIds = connectors.map((connector) => connector.id);
  const hasConnector = (connectorId: string) => connectorIds.includes(connectorId);
  const nextFromId = hasConnector(fromId) ? fromId : (connectorIds[0] ?? "");
  const nextToId = hasConnector(toId) ? toId : (connectorIds[1] ?? connectorIds[0] ?? "");
  return { fromId: nextFromId, toId: nextToId };
}

export function removeConnectorAndRelatedPaths(input: {
  connectorId: string;
  connectors: Connector[];
  paths: Path[];
  positions: Record<string, NodePosition>;
  currentFromId: string;
  currentToId: string;
  currentSelectedConnectorId: string;
  currentSelectedPathId: string;
}): {
  connectors: Connector[];
  paths: Path[];
  positions: Record<string, NodePosition>;
  nextFromId: string;
  nextToId: string;
  nextSelectedConnectorId: string;
  nextSelectedPathId: string;
} {
  const connectors = input.connectors.filter((connector) => connector.id !== input.connectorId);
  const paths = input.paths.filter(
    (path) => path.fromConnectorId !== input.connectorId && path.toConnectorId !== input.connectorId
  );
  const positions = { ...input.positions };
  delete positions[input.connectorId];

  const normalized = normalizePathEndpointSelection(connectors, input.currentFromId, input.currentToId);
  const nextSelectedConnectorId = connectors.some((connector) => connector.id === input.currentSelectedConnectorId)
    ? input.currentSelectedConnectorId
    : (connectors[0]?.id ?? "");
  const nextSelectedPathId = normalizeSelectedPathId(paths, input.currentSelectedPathId);

  return {
    connectors,
    paths,
    positions,
    nextFromId: normalized.fromId,
    nextToId: normalized.toId,
    nextSelectedConnectorId,
    nextSelectedPathId
  };
}

export function buildUniqueWireSections(paths: Path[]): UniqueWireSection[] {
  return paths
    .filter((path) => isCableSectionPath(path))
    .map((path) => ({
      pathId: path.id,
      wireName: path.wireName ?? path.id,
      fromNodeId: path.fromConnectorId,
      toNodeId: path.toConnectorId,
      lengthFt: typeof path.length === "number" && path.length >= 0 ? path.length : 0,
      sleeving: path.sleeving ?? "none",
      wireComponentId: path.wireComponentId
    }))
    .sort((left, right) => left.wireName.localeCompare(right.wireName));
}

export function buildConnectorPairTotals(input: {
  connectors: Connector[];
  junctions: Junction[];
  paths: Path[];
}): ConnectorPairTotal[] {
  const cablePaths = input.paths.filter((path) => isCableSectionPath(path));
  const nodeIds = new Set<string>([
    ...input.connectors.map((connector) => connector.id),
    ...input.junctions.map((junction) => junction.id)
  ]);
  const adjacency = new Map<string, Array<{ nodeId: string; weight: number }>>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }

  for (const path of cablePaths) {
    if (!nodeIds.has(path.fromConnectorId) || !nodeIds.has(path.toConnectorId)) {
      continue;
    }
    const weight = typeof path.length === "number" && path.length >= 0 ? path.length : 0;
    adjacency.get(path.fromConnectorId)?.push({ nodeId: path.toConnectorId, weight });
    adjacency.get(path.toConnectorId)?.push({ nodeId: path.fromConnectorId, weight });
  }

  const connectorIds = input.connectors.map((connector) => connector.id);
  const totals: ConnectorPairTotal[] = [];

  const shortestPath = (sourceId: string, targetId: string): { distance: number; hops: number } | null => {
    const distances = new Map<string, number>();
    const hops = new Map<string, number>();
    const visited = new Set<string>();
    for (const nodeId of nodeIds) {
      distances.set(nodeId, Number.POSITIVE_INFINITY);
      hops.set(nodeId, Number.POSITIVE_INFINITY);
    }
    distances.set(sourceId, 0);
    hops.set(sourceId, 0);

    while (visited.size < nodeIds.size) {
      let currentId: string | null = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const nodeId of nodeIds) {
        if (visited.has(nodeId)) {
          continue;
        }
        const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
        if (distance < currentDistance) {
          currentDistance = distance;
          currentId = nodeId;
        }
      }
      if (!currentId || !Number.isFinite(currentDistance)) {
        break;
      }
      if (currentId === targetId) {
        return {
          distance: currentDistance,
          hops: hops.get(currentId) ?? 0
        };
      }
      visited.add(currentId);
      for (const edge of adjacency.get(currentId) ?? []) {
        const nextDistance = currentDistance + edge.weight;
        const nextHops = (hops.get(currentId) ?? 0) + 1;
        const previousDistance = distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
        const previousHops = hops.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
        if (nextDistance < previousDistance || (nextDistance === previousDistance && nextHops < previousHops)) {
          distances.set(edge.nodeId, nextDistance);
          hops.set(edge.nodeId, nextHops);
        }
      }
    }
    return null;
  };

  for (let fromIndex = 0; fromIndex < connectorIds.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < connectorIds.length; toIndex += 1) {
      const fromConnectorId = connectorIds[fromIndex];
      const toConnectorId = connectorIds[toIndex];
      const result = shortestPath(fromConnectorId, toConnectorId);
      if (!result) {
        continue;
      }
      totals.push({
        fromConnectorId,
        toConnectorId,
        totalLengthFt: result.distance,
        hopCount: result.hops
      });
    }
  }

  return totals.sort((left, right) =>
    left.fromConnectorId === right.fromConnectorId
      ? left.toConnectorId.localeCompare(right.toConnectorId)
      : left.fromConnectorId.localeCompare(right.fromConnectorId)
  );
}
