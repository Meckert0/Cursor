import type { LibraryComponentDto, RevisionDto } from "./api";

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
  const pathIds = new Set(input.paths.map((path) => path.id));
  const connectorIds = new Set(input.connectors.map((connector) => connector.id));

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
    paths: input.paths,
    pinMappings: baseline.pinMappings.filter(
      (mapping) =>
        pathIds.has(mapping.pathId) &&
        connectorIds.has(mapping.fromConnectorId) &&
        connectorIds.has(mapping.toConnectorId)
    ),
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
  const serverPaths = normalizePathsWithWireDefaults(snapshot.paths);
  const serverPositions = buildDefaultPositions(serverConnectors, serverJunctions);
  const draft = readRawCanvasLocalDraft(revisionId);
  const hasLegacyDirtyFlag = draft !== null && draft.dirty === undefined;
  const recoveredDirty = Boolean(draft && (draft.dirty === true || hasLegacyDirtyFlag));

  if (!recoveredDirty) {
    return {
      connectors: serverConnectors,
      junctions: serverJunctions,
      paths: serverPaths,
      positions: serverPositions,
      dirty: false,
      recoveredDirty: false
    };
  }

  const connectors = normalizeUnassignedConnectors(
    Array.isArray(draft?.connectors) ? draft.connectors : serverConnectors
  );
  const junctions = Array.isArray(draft?.junctions) ? draft.junctions : serverJunctions;
  const paths = Array.isArray(draft?.paths) ? normalizePathsWithWireDefaults(draft.paths) : serverPaths;
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

export const PIN_COUNT_FIELD_KEY = "pincount";

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
  if (typeof component.pinCount === "number" && Number.isInteger(component.pinCount) && component.pinCount > 0) {
    return component.pinCount;
  }
  return parsePinCount(component.customFieldValues?.[PIN_COUNT_FIELD_KEY] ?? "");
}

export function formatConnectorPinsLabel(connector: Connector): string {
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

export function normalizePathsWithWireDefaults(paths: RevisionDto["snapshot"]["paths"]): RevisionDto["snapshot"]["paths"] {
  return paths.map((path, index) => ({
    ...path,
    wireName: path.wireName ?? `wire${index + 1}`,
    sleeving: path.sleeving ?? "none"
  }));
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
  const nodeIds = new Set<string>([
    ...input.connectors.map((connector) => connector.id),
    ...input.junctions.map((junction) => junction.id)
  ]);
  const adjacency = new Map<string, Array<{ nodeId: string; weight: number }>>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }

  for (const path of input.paths) {
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
