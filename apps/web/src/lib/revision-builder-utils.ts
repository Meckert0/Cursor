import type { RevisionDto } from "./api";

export type ConnectorRow = {
  id: string;
  reference: string;
  pinId: string;
  pinNumber: string;
};

export type PathRow = {
  id: string;
  wireName: string;
  fromConnectorId: string;
  toConnectorId: string;
  pathType: string;
  length: string;
  sleeving: "none" | "expandable_sleeving" | "wire_braid_under_expandable_sleeving";
  wireComponentId: string;
};

export type MappingRow = {
  id: string;
  pathId: string;
  fromConnectorId: string;
  fromPinId: string;
  toConnectorId: string;
  toPinId: string;
  mappingType: "one_to_one" | "one_to_many" | "loopback";
};

export type BundleRow = {
  id: string;
  name: string;
  pathIds: string;
};

export type AnnotationRow = {
  id: string;
  text: string;
};

export type BuilderRows = {
  connectors: ConnectorRow[];
  junctions: NonNullable<RevisionDto["snapshot"]["junctions"]>;
  paths: PathRow[];
  mappings: MappingRow[];
  bundles: BundleRow[];
  annotations: AnnotationRow[];
};

export type ConnectorLocationMap = Record<string, { x: number; y: number }>;

export type SnapshotConversionResult = BuilderRows & {
  connectorLocations: ConnectorLocationMap;
  notices: string[];
};

export type SnapshotDiffSummary = {
  added: string[];
  removed: string[];
  changed: string[];
};

export const INITIAL_CONNECTORS: ConnectorRow[] = [
  { id: "c1", reference: "J1", pinId: "1", pinNumber: "1" },
  { id: "c2", reference: "J2", pinId: "1", pinNumber: "1" }
];
export const INITIAL_JUNCTIONS: NonNullable<RevisionDto["snapshot"]["junctions"]> = [];

export const INITIAL_PATHS: PathRow[] = [
  {
    id: "p1",
    wireName: "wire1",
    fromConnectorId: "c1",
    toConnectorId: "c2",
    pathType: "wire",
    length: "",
    sleeving: "none",
    wireComponentId: ""
  }
];

export const INITIAL_MAPPINGS: MappingRow[] = [
  {
    id: "m1",
    pathId: "p1",
    fromConnectorId: "c1",
    fromPinId: "1",
    toConnectorId: "c2",
    toPinId: "1",
    mappingType: "one_to_one"
  }
];

export const INITIAL_BUNDLES: BundleRow[] = [];
export const INITIAL_ANNOTATIONS: AnnotationRow[] = [];

export function snapshotFromConnectorRows(
  rows: ConnectorRow[],
  connectorLocations?: ConnectorLocationMap
): RevisionTemplateSnapshot["connectors"] {
  const grouped = new Map<string, { id: string; reference: string; pins: Array<{ id: string; number: string }> }>();
  for (const row of rows) {
    const key = row.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: row.id,
        reference: row.reference,
        pins: []
      });
    }
    grouped.get(key)?.pins.push({
      id: row.pinId,
      number: row.pinNumber
    });
  }
  return Array.from(grouped.values()).map((connector) => {
    const location = connectorLocations?.[connector.id];
    return location ? { ...connector, location } : connector;
  });
}

type RevisionTemplateSnapshot = RevisionDto["snapshot"];

export function sanitizeConnectorLocations(rows: ConnectorRow[], connectorLocations?: ConnectorLocationMap): ConnectorLocationMap {
  if (!connectorLocations) {
    return {};
  }
  const connectorIds = new Set(rows.map((row) => row.id.trim()).filter((id) => id.length > 0));
  const normalized: ConnectorLocationMap = {};
  for (const [connectorId, location] of Object.entries(connectorLocations)) {
    if (connectorIds.has(connectorId)) {
      normalized[connectorId] = location;
    }
  }
  return normalized;
}

export function buildSnapshotFromRows(rows: BuilderRows, connectorLocations?: ConnectorLocationMap): RevisionTemplateSnapshot {
  const normalizedConnectorLocations = sanitizeConnectorLocations(rows.connectors, connectorLocations);
  return {
    connectors: snapshotFromConnectorRows(rows.connectors, normalizedConnectorLocations),
    junctions: rows.junctions,
    paths: rows.paths.map((path) => ({
      id: path.id,
      wireName: path.wireName.trim().length > 0 ? path.wireName.trim() : undefined,
      fromConnectorId: path.fromConnectorId,
      toConnectorId: path.toConnectorId,
      pathType: path.pathType,
      length: path.length.trim().length > 0 ? Number(path.length) : undefined,
      sleeving: path.sleeving,
      wireComponentId: path.wireComponentId.trim().length > 0 ? path.wireComponentId.trim() : undefined
    })),
    pinMappings: rows.mappings.map((mapping) => ({
      id: mapping.id,
      pathId: mapping.pathId,
      fromConnectorId: mapping.fromConnectorId,
      fromPinId: mapping.fromPinId,
      toConnectorId: mapping.toConnectorId,
      toPinId: mapping.toPinId,
      mappingType: mapping.mappingType
    })),
    bundles: rows.bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      pathIds: bundle.pathIds
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    })),
    annotations: rows.annotations.map((annotation) => ({
      id: annotation.id,
      text: annotation.text
    }))
  };
}

export function convertSnapshotToRows(snapshot: RevisionTemplateSnapshot): SnapshotConversionResult {
  const notices: string[] = [];
  const connectorLocations: ConnectorLocationMap = {};
  const connectors: ConnectorRow[] = snapshot.connectors.flatMap((connector) => {
    if (connector.location) {
      connectorLocations[connector.id] = connector.location;
    }
    if (connector.pins.length === 0) {
      notices.push(`Connector ${connector.id} has no pins; editor injected a placeholder pin.`);
      return [{ id: connector.id, reference: connector.reference, pinId: "1", pinNumber: "1" }];
    }
    return connector.pins.map((pin) => ({
      id: connector.id,
      reference: connector.reference,
      pinId: pin.id,
      pinNumber: pin.number
    }));
  });
  return {
    connectors: connectors.length > 0 ? connectors : INITIAL_CONNECTORS,
    junctions: snapshot.junctions ?? INITIAL_JUNCTIONS,
    paths: snapshot.paths.length
      ? snapshot.paths.map((path, index) => ({
        id: path.id,
        wireName: path.wireName ?? `wire${index + 1}`,
        fromConnectorId: path.fromConnectorId,
        toConnectorId: path.toConnectorId,
        pathType: path.pathType,
        length: typeof path.length === "number" ? String(path.length) : "",
        sleeving: path.sleeving ?? "none",
        wireComponentId: path.wireComponentId ?? ""
      }))
      : INITIAL_PATHS,
    mappings: snapshot.pinMappings.length
      ? snapshot.pinMappings.map((mapping) => ({
        id: mapping.id,
        pathId: mapping.pathId,
        fromConnectorId: mapping.fromConnectorId,
        fromPinId: mapping.fromPinId,
        toConnectorId: mapping.toConnectorId,
        toPinId: mapping.toPinId,
        mappingType: mapping.mappingType
      }))
      : INITIAL_MAPPINGS,
    bundles: snapshot.bundles.map((bundle) => ({ id: bundle.id, name: bundle.name, pathIds: bundle.pathIds.join(",") })),
    annotations: snapshot.annotations.map((annotation) => ({ id: annotation.id, text: annotation.text })),
    connectorLocations,
    notices
  };
}

function hasDuplicates(values: string[]) {
  const nonEmpty = values.filter((value) => value.length > 0);
  return new Set(nonEmpty).size !== nonEmpty.length;
}

export function buildClientValidationIssues(rows: BuilderRows): string[] {
  const { connectors, junctions, paths, mappings, bundles, annotations } = rows;
  const issues: string[] = [];
  const pushIf = (condition: boolean, message: string) => {
    if (condition) {
      issues.push(message);
    }
  };

  if (connectors.length === 0) issues.push("At least one connector is required.");
  if (paths.length === 0) issues.push("At least one path is required.");
  if (mappings.length === 0) issues.push("At least one pin mapping is required.");

  const connectorIds = connectors.map((item) => item.id.trim());
  const pathIds = paths.map((item) => item.id.trim());
  const mappingIds = mappings.map((item) => item.id.trim());
  const bundleIds = bundles.map((item) => item.id.trim());
  const annotationIds = annotations.map((item) => item.id.trim());

  pushIf(connectorIds.some((id) => id.length === 0), "All connector rows must have a connector id.");
  pushIf(connectors.some((item) => item.reference.trim().length === 0), "All connector rows must have a connector reference.");
  pushIf(connectors.some((item) => item.pinId.trim().length === 0), "All connector rows must have a pin id.");
  pushIf(connectors.some((item) => item.pinNumber.trim().length === 0), "All connector rows must have a pin number.");
  pushIf(pathIds.some((id) => id.length === 0), "All paths must have an id.");
  pushIf(paths.some((item) => item.wireName.trim().length === 0), "All paths must have an auto-generated wire name.");
  pushIf(paths.some((item) => item.length.trim().length > 0 && Number.isNaN(Number(item.length))), "Path length must be numeric.");
  pushIf(
    paths.some((item) => item.length.trim().length > 0 && Number(item.length) < 0),
    "Path length must be greater than or equal to zero."
  );
  pushIf(mappingIds.some((id) => id.length === 0), "All mappings must have an id.");
  pushIf(bundleIds.some((id) => id.length === 0), "All bundles must have an id.");
  pushIf(annotationIds.some((id) => id.length === 0), "All annotations must have an id.");
  pushIf(bundles.some((item) => item.name.trim().length === 0), "Bundles must include a name.");
  pushIf(annotations.some((item) => item.text.trim().length === 0), "Annotations must include text.");
  pushIf(hasDuplicates(pathIds), "Path ids must be unique.");
  pushIf(hasDuplicates(mappingIds), "Mapping ids must be unique.");
  pushIf(hasDuplicates(bundleIds), "Bundle ids must be unique.");
  pushIf(hasDuplicates(annotationIds), "Annotation ids must be unique.");

  const connectorIdSet = new Set(connectorIds.filter((id) => id.length > 0));
  const junctionIdSet = new Set(junctions.map((junction) => junction.id.trim()).filter((id) => id.length > 0));
  const pathNodeIdSet = new Set([...connectorIdSet, ...junctionIdSet]);
  const pathIdSet = new Set(pathIds);
  const connectorPinSet = new Set(connectors.map((item) => `${item.id.trim()}:${item.pinId.trim()}`));

  const connectorReferenceById = new Map<string, string>();
  connectors.forEach((connector) => {
    const connectorId = connector.id.trim();
    if (!connectorId) return;
    const existingReference = connectorReferenceById.get(connectorId);
    if (existingReference && existingReference !== connector.reference.trim()) {
      issues.push(`Connector ${connectorId} has conflicting references across pin rows.`);
    } else if (!existingReference) {
      connectorReferenceById.set(connectorId, connector.reference.trim());
    }
  });

  const pinKeyValues = connectors.map((item) => `${item.id.trim()}:${item.pinId.trim()}`);
  pushIf(hasDuplicates(pinKeyValues), "Pin ids must be unique within each connector.");

  paths.forEach((path) => {
    const from = path.fromConnectorId.trim();
    const to = path.toConnectorId.trim();
    pushIf(from.length === 0 || to.length === 0, `Path ${path.id || "(missing id)"} must include from/to connector ids.`);
    if (from.length > 0) pushIf(!pathNodeIdSet.has(from), `Path ${path.id || "(missing id)"} references missing from node "${from}".`);
    if (to.length > 0) pushIf(!pathNodeIdSet.has(to), `Path ${path.id || "(missing id)"} references missing to node "${to}".`);
  });

  mappings.forEach((mapping) => {
    const mappingId = mapping.id || "(missing id)";
    const pathId = mapping.pathId.trim();
    const fromConnectorId = mapping.fromConnectorId.trim();
    const toConnectorId = mapping.toConnectorId.trim();
    const fromPinId = mapping.fromPinId.trim();
    const toPinId = mapping.toPinId.trim();
    pushIf(pathId.length === 0, `Mapping ${mappingId} must include a path id.`);
    pushIf(fromConnectorId.length === 0 || toConnectorId.length === 0, `Mapping ${mappingId} must include from/to connector ids.`);
    pushIf(fromPinId.length === 0 || toPinId.length === 0, `Mapping ${mappingId} must include from/to pin ids.`);
    if (pathId.length > 0) pushIf(!pathIdSet.has(pathId), `Mapping ${mappingId} references missing path "${pathId}".`);
    if (fromConnectorId.length > 0) {
      pushIf(!connectorIdSet.has(fromConnectorId), `Mapping ${mappingId} references missing from connector "${fromConnectorId}".`);
      if (fromPinId.length > 0 && !connectorPinSet.has(`${fromConnectorId}:${fromPinId}`)) {
        issues.push(`Mapping ${mappingId} references missing source pin "${fromConnectorId}:${fromPinId}".`);
      }
    }
    if (toConnectorId.length > 0) {
      pushIf(!connectorIdSet.has(toConnectorId), `Mapping ${mappingId} references missing to connector "${toConnectorId}".`);
      if (toPinId.length > 0 && !connectorPinSet.has(`${toConnectorId}:${toPinId}`)) {
        issues.push(`Mapping ${mappingId} references missing destination pin "${toConnectorId}:${toPinId}".`);
      }
    }
  });

  const sourceKeys = mappings.map((mapping) => `${mapping.pathId.trim()}|${mapping.fromConnectorId.trim()}|${mapping.fromPinId.trim()}`);
  pushIf(hasDuplicates(sourceKeys), "Pin mappings contain duplicate source references (pathId + fromConnectorId + fromPinId).");

  bundles.forEach((bundle) => {
    const bundleId = bundle.id || "(missing id)";
    const parsedPathIds = bundle.pathIds
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    pushIf(parsedPathIds.length === 0, `Bundle ${bundleId} must include at least one path id.`);
    pushIf(hasDuplicates(parsedPathIds), `Bundle ${bundleId} contains duplicate path ids.`);
    parsedPathIds.forEach((pathId) => pushIf(!pathIdSet.has(pathId), `Bundle ${bundleId} references missing path "${pathId}".`));
  });

  return Array.from(new Set(issues));
}

function toStableKeys(items: Array<{ id: string }>) {
  return new Set(items.map((item) => item.id));
}

export function summarizeSnapshotDiff(base: RevisionTemplateSnapshot, current: RevisionTemplateSnapshot): Record<string, SnapshotDiffSummary> {
  const compute = <T extends { id: string }>(left: T[], right: T[]): SnapshotDiffSummary => {
    const leftById = new Map(left.map((item) => [item.id, JSON.stringify(item)]));
    const rightById = new Map(right.map((item) => [item.id, JSON.stringify(item)]));
    const leftIds = toStableKeys(left);
    const rightIds = toStableKeys(right);

    const added = Array.from(rightIds).filter((id) => !leftIds.has(id)).sort();
    const removed = Array.from(leftIds).filter((id) => !rightIds.has(id)).sort();
    const changed = Array.from(leftIds)
      .filter((id) => rightIds.has(id) && leftById.get(id) !== rightById.get(id))
      .sort();
    return { added, removed, changed };
  };

  return {
    connectors: compute(base.connectors, current.connectors),
    junctions: compute(base.junctions ?? [], current.junctions ?? []),
    paths: compute(base.paths, current.paths),
    pinMappings: compute(base.pinMappings, current.pinMappings),
    bundles: compute(base.bundles, current.bundles),
    annotations: compute(base.annotations, current.annotations)
  };
}
