export type SnapshotPath = {
  id: string;
  pathType?: string;
  wirelistManaged?: boolean;
  fromLocation?: string;
  toLocation?: string;
  fromContact?: string;
  fromSignalDescription?: string;
  wireAwg?: string;
  wirePartNumber?: string;
  wireColor?: string;
  wireGroup?: string;
  toContact?: string;
  toSignalDescription?: string;
  labelPartNumber?: string;
  labelText?: string;
  notes?: string;
  wireComponentId?: string;
};

export function pinMappedPathIds(pinMappings: Array<{ pathId: string }> = []): Set<string> {
  return new Set(pinMappings.map((mapping) => mapping.pathId));
}

export function hasWirelistDetail(path: SnapshotPath): boolean {
  return [
    path.fromLocation,
    path.toLocation,
    path.fromContact,
    path.fromSignalDescription,
    path.wireAwg,
    path.wirePartNumber,
    path.wireColor,
    path.wireGroup,
    path.toContact,
    path.toSignalDescription,
    path.labelPartNumber,
    path.labelText,
    path.notes,
    path.wireComponentId
  ].some((value) => String(value ?? "").trim().length > 0);
}

export function normalizePathType(
  path: SnapshotPath,
  mappedPathIds: Set<string> = new Set()
): "cable" | "wire" {
  if (path.pathType === "cable") {
    return "cable";
  }
  if (
    path.pathType === "wire" &&
    (path.wirelistManaged || mappedPathIds.has(path.id) || hasWirelistDetail(path))
  ) {
    return "wire";
  }
  if (path.pathType === "wire") {
    return "cable";
  }
  return "cable";
}

export function isWireRunPath(path: SnapshotPath, mappedPathIds: Set<string> = new Set()): boolean {
  return normalizePathType(path, mappedPathIds) === "wire";
}

export function isCableSectionPath(path: SnapshotPath, mappedPathIds: Set<string> = new Set()): boolean {
  return normalizePathType(path, mappedPathIds) === "cable";
}

export function partitionSnapshotPaths<T extends SnapshotPath>(
  paths: T[],
  pinMappings: Array<{ pathId: string }> = []
): { cablePaths: T[]; wireRunPaths: T[] } {
  const mappedPathIds = pinMappedPathIds(pinMappings);
  const cablePaths: T[] = [];
  const wireRunPaths: T[] = [];
  for (const path of paths) {
    if (isWireRunPath(path, mappedPathIds)) {
      wireRunPaths.push(path);
    } else {
      cablePaths.push(path);
    }
  }
  return { cablePaths, wireRunPaths };
}

export function mergeSnapshotPaths<T extends SnapshotPath>(cablePaths: T[], wireRunPaths: T[]): T[] {
  return [...cablePaths, ...wireRunPaths];
}
