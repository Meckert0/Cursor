import type { LibraryLookup } from "./bom.js";
import type { DesignSnapshot, ValidationIssue, ValidationReport } from "./types.js";

export interface ValidateSnapshotOptions {
  libraryLookup?: LibraryLookup;
}

function addLibraryPartIssues(
  issues: ValidationIssue[],
  input: {
    entityType: string;
    entityId: string;
    partLabel: string;
    libraryComponentId?: string;
    partNumber?: string;
    categories?: Parameters<LibraryLookup["byPartNumber"]>[1];
    lookup: LibraryLookup;
  }
) {
  const partNumber = input.partNumber?.trim();
  if (!input.libraryComponentId && !partNumber) {
    return;
  }

  let component = input.libraryComponentId ? input.lookup.byId(input.libraryComponentId) : undefined;
  if (!component && partNumber) {
    component = input.lookup.byPartNumber(partNumber, input.categories);
  }

  if (!component) {
    issues.push({
      severity: "error",
      code: "RULE_LIBRARY_PART_NOT_FOUND",
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${partNumber ?? input.libraryComponentId}" was not found in the component library.`
    });
    return;
  }

  if (!component.isActive) {
    issues.push({
      severity: "warning",
      code: "RULE_LIBRARY_PART_INACTIVE",
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${component.partNumber}" is inactive in the component library.`
    });
  }

  if (!component.isReviewed) {
    issues.push({
      severity: "warning",
      code: "RULE_LIBRARY_PART_UNREVIEWED",
      entityType: input.entityType,
      entityId: input.entityId,
      message: `${input.partLabel} "${component.partNumber}" is unreviewed in the component library.`
    });
  }
}

export function validateSnapshot(snapshot: DesignSnapshot, options: ValidateSnapshotOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const connectorIds = new Set(snapshot.connectors.map((c) => c.id));
  const junctionIds = new Set((snapshot.junctions ?? []).map((junction) => junction.id));
  const nodeIds = new Set([...connectorIds, ...junctionIds]);
  const pathIds = new Set(snapshot.paths.map((p) => p.id));
  const pathById = new Map(snapshot.paths.map((p) => [p.id, p]));
  const connectorPins = new Map(snapshot.connectors.map((c) => [c.id, new Set(c.pins.map((p) => p.id))]));
  const connectorUsage = new Map(snapshot.connectors.map((c) => [c.id, 0]));
  const sourceKeyCount = new Map<string, number>();

  const addIssue = (issue: ValidationIssue) => {
    issues.push(issue);
  };

  for (const path of snapshot.paths) {
    if (!nodeIds.has(path.fromConnectorId) || !nodeIds.has(path.toConnectorId)) {
      addIssue({
        severity: "error",
        code: "RULE_PATH_CONNECTOR_NOT_FOUND",
        entityType: "path",
        entityId: path.id,
        message: "Path references connector or junction node that does not exist in this revision."
      });
    }

    if (connectorIds.has(path.fromConnectorId)) {
      connectorUsage.set(path.fromConnectorId, (connectorUsage.get(path.fromConnectorId) ?? 0) + 1);
    }
    if (connectorIds.has(path.toConnectorId)) {
      connectorUsage.set(path.toConnectorId, (connectorUsage.get(path.toConnectorId) ?? 0) + 1);
    }
  }

  for (const bundle of snapshot.bundles) {
    for (const pathId of bundle.pathIds) {
      if (!pathIds.has(pathId)) {
        addIssue({
          severity: "error",
          code: "RULE_BUNDLE_PATH_NOT_FOUND",
          entityType: "bundle",
          entityId: bundle.id,
          message: "Bundle references a path that does not exist."
        });
      }
    }
  }

  for (const mapping of snapshot.pinMappings) {
    if (!pathIds.has(mapping.pathId)) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_INVALID_PATH",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping references a path that does not exist."
      });
    }
    if (!connectorIds.has(mapping.fromConnectorId) || !connectorIds.has(mapping.toConnectorId)) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_CONNECTOR_NOT_FOUND",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping references connector that does not exist."
      });
    }

    if (!mapping.fromPinId.trim() || !mapping.toPinId.trim()) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_INCOMPLETE",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping must include both source and destination pins."
      });
    }

    const sourcePins = connectorPins.get(mapping.fromConnectorId);
    if (sourcePins && !sourcePins.has(mapping.fromPinId)) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_SOURCE_PIN_NOT_FOUND",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping source pin does not exist on source connector."
      });
    }

    const destinationPins = connectorPins.get(mapping.toConnectorId);
    if (destinationPins && !destinationPins.has(mapping.toPinId)) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Pin mapping destination pin does not exist on destination connector."
      });
    }

    const sourceKey = `${mapping.pathId}:${mapping.fromConnectorId}:${mapping.fromPinId}`;
    const count = (sourceKeyCount.get(sourceKey) ?? 0) + 1;
    sourceKeyCount.set(sourceKey, count);
    if (count > 1) {
      addIssue({
        severity: "error",
        code: "RULE_PIN_MAPPING_DUPLICATE_SOURCE",
        entityType: "pinMapping",
        entityId: mapping.id,
        message: "Duplicate source pin mapping detected for this path."
      });
    }

    const path = pathById.get(mapping.pathId);
    if (path) {
      const matchesForward = path.fromConnectorId === mapping.fromConnectorId && path.toConnectorId === mapping.toConnectorId;
      const matchesReverse = path.fromConnectorId === mapping.toConnectorId && path.toConnectorId === mapping.fromConnectorId;
      if (!matchesForward && !matchesReverse) {
        addIssue({
          severity: "error",
          code: "RULE_PIN_MAPPING_ENDPOINT_MISMATCH",
          entityType: "pinMapping",
          entityId: mapping.id,
          message: "Pin mapping connector endpoints do not match mapped path endpoints."
        });
      }
    }
  }

  for (const connector of snapshot.connectors) {
    if ((connectorUsage.get(connector.id) ?? 0) === 0) {
      addIssue({
        severity: "warning",
        code: "RULE_CONNECTOR_ORPHANED",
        entityType: "connector",
        entityId: connector.id,
        message: "Connector is not used by any path."
      });
    }
  }

  if (options.libraryLookup) {
    for (const connector of snapshot.connectors) {
      addLibraryPartIssues(issues, {
        entityType: "connector",
        entityId: connector.id,
        partLabel: "Connector part",
        libraryComponentId: connector.libraryComponentId,
        partNumber: connector.partNumber,
        categories: ["module", "contact"],
        lookup: options.libraryLookup
      });
    }

    for (const path of snapshot.paths) {
      addLibraryPartIssues(issues, {
        entityType: "path",
        entityId: path.id,
        partLabel: "Wire part",
        libraryComponentId: path.wireComponentId,
        partNumber: path.wirePartNumber,
        categories: "wire",
        lookup: options.libraryLookup
      });

      if (path.labelPartNumber?.trim()) {
        addLibraryPartIssues(issues, {
          entityType: "path",
          entityId: path.id,
          partLabel: "Label part",
          partNumber: path.labelPartNumber,
          categories: "label",
          lookup: options.libraryLookup
        });
      }
    }
  }

  const sortedIssues = issues.sort((a, b) => {
    const left = `${a.code}:${a.entityType ?? ""}:${a.entityId ?? ""}:${a.message}`;
    const right = `${b.code}:${b.entityType ?? ""}:${b.entityId ?? ""}:${b.message}`;
    return left.localeCompare(right);
  });

  const errors = sortedIssues.filter((i) => i.severity === "error").length;
  const warnings = sortedIssues.filter((i) => i.severity === "warning").length;
  const infos = sortedIssues.filter((i) => i.severity === "info").length;

  return { errors, warnings, infos, results: sortedIssues };
}
