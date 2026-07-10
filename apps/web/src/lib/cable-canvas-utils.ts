import type { LibraryComponentDto, RevisionDto } from "./api";

type NodePosition = {
  x: number;
  y: number;
};

type Connector = RevisionDto["snapshot"]["connectors"][number];
type Path = RevisionDto["snapshot"]["paths"][number];
type Junction = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];

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
  const defaultConnectors = normalizeUnassignedConnectors(snapshot.connectors);
  const defaultJunctions = snapshot.junctions ?? [];
  const defaultPaths = normalizePathsWithWireDefaults(snapshot.paths);

  if (typeof window === "undefined") {
    return {
      connectors: defaultConnectors,
      junctions: defaultJunctions,
      paths: defaultPaths
    };
  }

  const draftStorageKey = `cable-canvas-draft:${revisionId}`;
  let draft: Partial<Pick<RevisionDto["snapshot"], "connectors" | "junctions" | "paths">> | null = null;
  try {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    draft = rawDraft ? (JSON.parse(rawDraft) as Partial<Pick<RevisionDto["snapshot"], "connectors" | "junctions" | "paths">>) : null;
  } catch {
    draft = null;
  }

  return {
    connectors: normalizeUnassignedConnectors(
      Array.isArray(draft?.connectors) ? draft.connectors : defaultConnectors
    ),
    junctions: Array.isArray(draft?.junctions) ? draft.junctions : defaultJunctions,
    paths: Array.isArray(draft?.paths) ? normalizePathsWithWireDefaults(draft.paths) : defaultPaths
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
