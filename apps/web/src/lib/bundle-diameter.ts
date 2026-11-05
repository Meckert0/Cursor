import type { RevisionDto } from "./api";
import { bundleDiameterInches } from "./cable-canvas-utils";
import { isCableSectionPath, isWireRunPath, pinMappedPathIds } from "./path-roles";
import { resolveWirelistEndpoint } from "./wirelist-utils";

type Snapshot = RevisionDto["snapshot"];
type SnapshotPathRecord = Snapshot["paths"][number];
type ConnectorCatalogEntry = {
  partNumber: string;
  attributes?: Record<string, unknown> | null;
};

type RouteEdge = {
  pathId: string;
  nodeId: string;
  weight: number;
};

/**
 * Cable-section ids on the shortest route between two harness nodes.
 * Length is the edge weight, matching endpoint totals. Equal length and hop
 * count keep the lower path id so a wire is assigned to one section.
 * Returns an empty list when both ends are the same node, and null when the
 * endpoints are not on one connected cable route.
 */
export function cableSectionIdsBetween(
  cablePaths: Array<Pick<SnapshotPathRecord, "id" | "fromConnectorId" | "toConnectorId" | "length">>,
  nodeIds: Iterable<string>,
  fromNodeId: string,
  toNodeId: string
): string[] | null {
  const nodes = new Set(nodeIds);
  if (!fromNodeId || !toNodeId || !nodes.has(fromNodeId) || !nodes.has(toNodeId)) {
    return null;
  }
  if (fromNodeId === toNodeId) {
    return [];
  }

  const adjacency = new Map<string, RouteEdge[]>();
  for (const nodeId of nodes) {
    adjacency.set(nodeId, []);
  }
  for (const path of cablePaths) {
    if (!nodes.has(path.fromConnectorId) || !nodes.has(path.toConnectorId)) {
      continue;
    }
    if (path.fromConnectorId === path.toConnectorId) {
      continue;
    }
    const weight = typeof path.length === "number" && Number.isFinite(path.length) && path.length >= 0 ? path.length : 0;
    adjacency.get(path.fromConnectorId)?.push({ pathId: path.id, nodeId: path.toConnectorId, weight });
    adjacency.get(path.toConnectorId)?.push({ pathId: path.id, nodeId: path.fromConnectorId, weight });
  }

  const distances = new Map<string, number>();
  const hops = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; pathId: string }>();
  const visited = new Set<string>();
  for (const nodeId of nodes) {
    distances.set(nodeId, Number.POSITIVE_INFINITY);
    hops.set(nodeId, Number.POSITIVE_INFINITY);
  }
  distances.set(fromNodeId, 0);
  hops.set(fromNodeId, 0);

  while (visited.size < nodes.size) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const nodeId of nodes) {
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
    if (currentId === toNodeId) {
      break;
    }
    visited.add(currentId);
    for (const edge of adjacency.get(currentId) ?? []) {
      if (visited.has(edge.nodeId)) {
        continue;
      }
      const nextDistance = currentDistance + edge.weight;
      const nextHops = (hops.get(currentId) ?? 0) + 1;
      const previousDistance = distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
      const previousHops = hops.get(edge.nodeId) ?? Number.POSITIVE_INFINITY;
      const previousEdge = previous.get(edge.nodeId);
      const better =
        nextDistance < previousDistance ||
        (nextDistance === previousDistance && nextHops < previousHops) ||
        (nextDistance === previousDistance &&
          nextHops === previousHops &&
          (previousEdge === undefined || edge.pathId < previousEdge.pathId));
      if (better) {
        distances.set(edge.nodeId, nextDistance);
        hops.set(edge.nodeId, nextHops);
        previous.set(edge.nodeId, { nodeId: currentId, pathId: edge.pathId });
      }
    }
  }

  if (!Number.isFinite(distances.get(toNodeId) ?? Number.POSITIVE_INFINITY)) {
    return null;
  }

  const pathIds: string[] = [];
  let cursor = toNodeId;
  const guard = nodes.size + 1;
  let steps = 0;
  while (cursor !== fromNodeId) {
    const step = previous.get(cursor);
    if (!step || steps > guard) {
      return null;
    }
    pathIds.push(step.pathId);
    cursor = step.nodeId;
    steps += 1;
  }
  pathIds.reverse();
  return pathIds;
}

export function readWireOverallDiameterIn(
  component: { category?: string; attributes?: Record<string, unknown> | null } | undefined
): number | null {
  if (!component || component.category !== "wire") {
    return null;
  }
  const raw = component.attributes?.overallDia;
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function lookupWireOverallDiameterIn(
  wire: { wireComponentId?: string; wirePartNumber?: string },
  catalog: Array<{ id: string; category: string; partNumber: string; attributes?: Record<string, unknown> | null }>
): number | null {
  const id = wire.wireComponentId?.trim();
  if (id) {
    const match = catalog.find((part) => part.id === id);
    if (match) {
      return readWireOverallDiameterIn(match);
    }
  }
  const partNumber = wire.wirePartNumber?.trim().toLowerCase();
  if (!partNumber) {
    return null;
  }
  const match = catalog.find(
    (part) => part.category === "wire" && part.partNumber.trim().toLowerCase() === partNumber
  );
  return readWireOverallDiameterIn(match);
}

function resolveEndpointNodeId(
  directId: string | undefined,
  location: string | undefined,
  known: Set<string>,
  snapshot: Pick<Snapshot, "connectors" | "junctions">,
  connectorCatalog: ConnectorCatalogEntry[]
): string {
  const direct = directId?.trim() ?? "";
  if (direct && known.has(direct)) {
    return direct;
  }
  const candidates = [location?.trim() ?? "", direct].filter((value) => value.length > 0);
  for (const candidate of candidates) {
    const resolved = resolveWirelistEndpoint(candidate, snapshot, connectorCatalog);
    if (resolved.kind !== "unresolved" && resolved.nodeId && known.has(resolved.nodeId)) {
      return resolved.nodeId;
    }
  }
  return "";
}

/**
 * Bundle diameter, in inches, for each cable section.
 * A wirelist wire is carried by every cable section on the route between its
 * endpoints. Sections with no routed wires, or with any wire missing a
 * positive overall diameter from the item database, stay null.
 */
export function cableSectionBundleDiameters(input: {
  connectors: Snapshot["connectors"];
  junctions?: Snapshot["junctions"];
  cablePaths: Snapshot["paths"];
  wireRuns: Snapshot["paths"];
  wireCatalog: Array<{ id: string; category: string; partNumber: string; attributes?: Record<string, unknown> | null }>;
  connectorCatalog?: ConnectorCatalogEntry[];
  pinMappings?: Snapshot["pinMappings"];
}): Map<string, number | null> {
  const junctions = input.junctions ?? [];
  const connectorCatalog = input.connectorCatalog ?? [];
  const mappedPathIds = pinMappedPathIds(input.pinMappings ?? []);
  const cablePaths = input.cablePaths.filter((path) => isCableSectionPath(path, mappedPathIds));
  const wireRuns = input.wireRuns.filter((path) => isWireRunPath(path, mappedPathIds));
  const known = new Set<string>([
    ...input.connectors.map((connector) => connector.id),
    ...junctions.map((junction) => junction.id)
  ]);
  const topology = { connectors: input.connectors, junctions };
  const diametersBySection = new Map<string, Array<number | null>>();
  for (const path of cablePaths) {
    diametersBySection.set(path.id, []);
  }

  for (const wire of wireRuns) {
    const fromNodeId = resolveEndpointNodeId(wire.fromConnectorId, wire.fromLocation, known, topology, connectorCatalog);
    const toNodeId = resolveEndpointNodeId(wire.toConnectorId, wire.toLocation, known, topology, connectorCatalog);
    const sectionIds = cableSectionIdsBetween(cablePaths, known, fromNodeId, toNodeId);
    if (!sectionIds) {
      continue;
    }
    const diameter = lookupWireOverallDiameterIn(wire, input.wireCatalog);
    for (const sectionId of sectionIds) {
      diametersBySection.get(sectionId)?.push(diameter);
    }
  }

  const result = new Map<string, number | null>();
  for (const [sectionId, diameters] of diametersBySection) {
    result.set(sectionId, bundleDiameterInches(diameters));
  }
  return result;
}

type SleeveRange = {
  minDia: number;
  maxDia: number;
  minInclusive: boolean;
};

function readSleeveSizeRanges(attributes: Record<string, unknown> | null | undefined): SleeveRange[] {
  const raw = attributes?.sizeRanges;
  if (!Array.isArray(raw)) {
    return [];
  }
  const ranges: SleeveRange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const minDia = (entry as { minDia?: unknown }).minDia;
    const maxDia = (entry as { maxDia?: unknown }).maxDia;
    if (
      typeof minDia !== "number" ||
      typeof maxDia !== "number" ||
      !Number.isFinite(minDia) ||
      !Number.isFinite(maxDia) ||
      maxDia < minDia
    ) {
      continue;
    }
    ranges.push({ minDia, maxDia, minInclusive: (entry as { minInclusive?: unknown }).minInclusive !== false });
  }
  return ranges;
}

/**
 * Sleeve, tube, or braid whose size range contains the bundle diameter.
 * Family must match the cable section sleeving style. The tightest containing
 * range wins so the part is the size used on that section.
 */
export function selectSleeveForBundleDiameter(input: {
  sleeving: string;
  bundleDiameterIn: number | null;
  sleeves: Array<{
    id: string;
    category: string;
    family: string;
    partNumber: string;
    attributes?: Record<string, unknown> | null;
  }>;
}): { id: string; partNumber: string } | null {
  if (!input.sleeving || input.sleeving === "none" || input.bundleDiameterIn === null) {
    return null;
  }
  if (!Number.isFinite(input.bundleDiameterIn) || input.bundleDiameterIn <= 0) {
    return null;
  }
  const normalizeFamily = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const style = normalizeFamily(input.sleeving);
  const diameter = input.bundleDiameterIn;
  let best: { id: string; partNumber: string; span: number; maxDia: number } | null = null;
  for (const part of input.sleeves) {
    if (part.category !== "sleeve-tube-braid" || normalizeFamily(part.family) !== style) {
      continue;
    }
    for (const range of readSleeveSizeRanges(part.attributes)) {
      if (diameter < range.minDia || (!range.minInclusive && diameter === range.minDia) || diameter > range.maxDia) {
        continue;
      }
      const span = range.maxDia - range.minDia;
      const candidate = { id: part.id, partNumber: part.partNumber, span, maxDia: range.maxDia };
      if (
        !best ||
        candidate.span < best.span ||
        (candidate.span === best.span && candidate.maxDia < best.maxDia) ||
        (candidate.span === best.span &&
          candidate.maxDia === best.maxDia &&
          candidate.partNumber.localeCompare(best.partNumber) < 0)
      ) {
        best = candidate;
      }
    }
  }
  return best ? { id: best.id, partNumber: best.partNumber } : null;
}
