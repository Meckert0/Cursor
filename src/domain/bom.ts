import type { LibraryCategory, LibraryComponentRecord } from "./library.js";
import type { DesignSnapshot, Revision } from "./types.js";

export type BomResolution = "resolved" | "not_found" | "inactive" | "unreviewed";
export type BomUnit = "ea" | "in";
export type BomCategory = LibraryCategory | "connector" | "sleeving" | "unknown";

export interface BomLine {
  category: BomCategory;
  partNumber: string;
  description: string;
  family?: string;
  quantity: number;
  unit: BomUnit;
  resolution: BomResolution;
  libraryComponentId?: string;
  designRefs: string[];
  notes?: string;
}

export interface BomResult {
  revisionId: string;
  libraryVersion: string;
  lines: BomLine[];
  summary: {
    totalLines: number;
    resolved: number;
    unresolved: number;
  };
}

export interface LibraryLookup {
  byId(id: string): LibraryComponentRecord | undefined;
  byPartNumber(partNumber: string, category?: LibraryCategory | LibraryCategory[]): LibraryComponentRecord | undefined;
}

export function createLibraryLookup(components: LibraryComponentRecord[]): LibraryLookup {
  const byId = new Map(components.map((component) => [component.id, component]));
  const byPartNumber = new Map<string, LibraryComponentRecord[]>();
  for (const component of components) {
    const key = normalizePartNumber(component.partNumber);
    if (!key) {
      continue;
    }
    const existing = byPartNumber.get(key) ?? [];
    existing.push(component);
    byPartNumber.set(key, existing);
  }

  return {
    byId(id: string) {
      return byId.get(id);
    },
    byPartNumber(partNumber: string, category?: LibraryCategory | LibraryCategory[]) {
      const key = normalizePartNumber(partNumber);
      if (!key) {
        return undefined;
      }
      const matches = byPartNumber.get(key) ?? [];
      if (!category) {
        return matches[0];
      }
      const categories = Array.isArray(category) ? category : [category];
      return matches.find((component) => categories.includes(component.category));
    }
  };
}

function normalizePartNumber(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolutionFor(component: LibraryComponentRecord | undefined): BomResolution {
  if (!component) {
    return "not_found";
  }
  if (!component.isActive) {
    return "inactive";
  }
  if (!component.isReviewed) {
    return "unreviewed";
  }
  return "resolved";
}

type AggregateKey = string;

interface AggregateLine {
  category: BomCategory;
  partNumber: string;
  description: string;
  family?: string;
  quantity: number;
  unit: BomUnit;
  resolution: BomResolution;
  libraryComponentId?: string;
  designRefs: Set<string>;
  notes?: string;
}

function aggregateKey(category: BomCategory, partNumber: string, unit: BomUnit, resolution: BomResolution): AggregateKey {
  return `${category}|${normalizePartNumber(partNumber)}|${unit}|${resolution}`;
}

function upsertAggregate(
  aggregates: Map<AggregateKey, AggregateLine>,
  input: {
    category: BomCategory;
    partNumber: string;
    description: string;
    family?: string;
    quantity: number;
    unit: BomUnit;
    resolution: BomResolution;
    libraryComponentId?: string;
    designRef: string;
    notes?: string;
  }
) {
  const key = aggregateKey(input.category, input.partNumber, input.unit, input.resolution);
  const existing = aggregates.get(key);
  if (!existing) {
    aggregates.set(key, {
      category: input.category,
      partNumber: input.partNumber,
      description: input.description,
      family: input.family,
      quantity: input.quantity,
      unit: input.unit,
      resolution: input.resolution,
      libraryComponentId: input.libraryComponentId,
      designRefs: new Set([input.designRef]),
      notes: input.notes
    });
    return;
  }
  existing.quantity += input.quantity;
  existing.designRefs.add(input.designRef);
  if (!existing.description && input.description) {
    existing.description = input.description;
  }
  if (!existing.family && input.family) {
    existing.family = input.family;
  }
  if (!existing.libraryComponentId && input.libraryComponentId) {
    existing.libraryComponentId = input.libraryComponentId;
  }
  if (!existing.notes && input.notes) {
    existing.notes = input.notes;
  }
}

function resolveComponent(
  lookup: LibraryLookup,
  input: {
    libraryComponentId?: string;
    partNumber?: string;
    categories?: LibraryCategory | LibraryCategory[];
  }
): LibraryComponentRecord | undefined {
  if (input.libraryComponentId) {
    const byId = lookup.byId(input.libraryComponentId);
    if (byId) {
      return byId;
    }
  }
  if (input.partNumber) {
    return lookup.byPartNumber(input.partNumber, input.categories);
  }
  return undefined;
}

const SLEEVING_LABELS: Record<string, string> = {
  expandable_sleeving: "Expandable sleeving",
  wire_braid_under_expandable_sleeving: "Wire braid under expandable sleeving"
};

export function buildBom(revision: Revision, lookup: LibraryLookup): BomResult {
  const aggregates = new Map<AggregateKey, AggregateLine>();
  const snapshot: DesignSnapshot = revision.snapshot;

  for (const connector of snapshot.connectors) {
    const partNumber = connector.partNumber?.trim();
    if (!partNumber && !connector.libraryComponentId) {
      upsertAggregate(aggregates, {
        category: "connector",
        partNumber: `(unspecified:${connector.reference})`,
        description: `Connector ${connector.reference} has no part number`,
        quantity: 1,
        unit: "ea",
        resolution: "not_found",
        designRef: connector.reference,
        notes: "Missing connector part number"
      });
      continue;
    }

    const component = resolveComponent(lookup, {
      libraryComponentId: connector.libraryComponentId,
      partNumber,
      categories: ["module", "contact"]
    });
    const resolvedPartNumber = component?.partNumber ?? partNumber ?? connector.libraryComponentId ?? "UNKNOWN";
    upsertAggregate(aggregates, {
      category: component?.category ?? "connector",
      partNumber: resolvedPartNumber,
      description: component?.description ?? `Connector ${connector.reference}`,
      family: component?.family,
      quantity: 1,
      unit: "ea",
      resolution: resolutionFor(component),
      libraryComponentId: component?.id ?? connector.libraryComponentId,
      designRef: connector.reference
    });
  }

  for (const path of snapshot.paths) {
    const wirePartNumber = path.wirePartNumber?.trim();
    if (wirePartNumber || path.wireComponentId) {
      const component = resolveComponent(lookup, {
        libraryComponentId: path.wireComponentId,
        partNumber: wirePartNumber,
        categories: "wire"
      });
      const resolvedPartNumber = component?.partNumber ?? wirePartNumber ?? path.wireComponentId ?? "UNKNOWN";
      const hasLength = typeof path.length === "number" && Number.isFinite(path.length);
      const quantity = hasLength ? path.length! : 1;
      const unit: BomUnit = hasLength ? "in" : "ea";
      upsertAggregate(aggregates, {
        category: "wire",
        partNumber: resolvedPartNumber,
        description: component?.description ?? `Wire ${resolvedPartNumber}`,
        family: component?.family,
        quantity,
        unit,
        resolution: resolutionFor(component),
        libraryComponentId: component?.id ?? path.wireComponentId,
        designRef: `run:${path.runNumber ?? path.id}`,
        notes: hasLength ? undefined : "Path length missing; counted as 1 ea"
      });
    }

    const labelPartNumber = path.labelPartNumber?.trim();
    if (labelPartNumber) {
      const component = resolveComponent(lookup, {
        partNumber: labelPartNumber,
        categories: "label"
      });
      upsertAggregate(aggregates, {
        category: "label",
        partNumber: component?.partNumber ?? labelPartNumber,
        description: component?.description ?? `Label ${labelPartNumber}`,
        family: component?.family,
        quantity: 1,
        unit: "ea",
        resolution: resolutionFor(component),
        libraryComponentId: component?.id,
        designRef: `run:${path.runNumber ?? path.id}`
      });
    }

    for (const contactValue of [path.fromContact, path.toContact]) {
      const contactPartNumber = contactValue?.trim();
      if (!contactPartNumber) {
        continue;
      }
      const component = resolveComponent(lookup, {
        partNumber: contactPartNumber,
        categories: "contact"
      });
      // Only include contacts that look like catalog part numbers (resolved or unmatched non-pin-like strings).
      // Pure pin numbers that do not match the catalog are still reported as unresolved contact lines
      // so free-text contact fields remain visible in the BOM.
      upsertAggregate(aggregates, {
        category: "contact",
        partNumber: component?.partNumber ?? contactPartNumber,
        description: component?.description ?? `Contact ${contactPartNumber}`,
        family: component?.family,
        quantity: 1,
        unit: "ea",
        resolution: resolutionFor(component),
        libraryComponentId: component?.id,
        designRef: `run:${path.runNumber ?? path.id}`
      });
    }

    if (path.sleeving && path.sleeving !== "none") {
      const hasLength = typeof path.length === "number" && Number.isFinite(path.length);
      const quantity = hasLength ? path.length! : 1;
      const unit: BomUnit = hasLength ? "in" : "ea";
      upsertAggregate(aggregates, {
        category: "sleeving",
        partNumber: path.sleeving,
        description: SLEEVING_LABELS[path.sleeving] ?? path.sleeving,
        quantity,
        unit,
        resolution: "resolved",
        designRef: `run:${path.runNumber ?? path.id}`,
        notes: hasLength ? undefined : "Path length missing; counted as 1 ea"
      });
    }
  }

  const lines = Array.from(aggregates.values())
    .map((line) => ({
      category: line.category,
      partNumber: line.partNumber,
      description: line.description,
      family: line.family,
      quantity: Number(line.quantity.toFixed(4)),
      unit: line.unit,
      resolution: line.resolution,
      libraryComponentId: line.libraryComponentId,
      designRefs: Array.from(line.designRefs).sort((left, right) => left.localeCompare(right)),
      notes: line.notes
    }))
    .sort((left, right) => {
      const leftKey = `${left.category}|${left.partNumber}|${left.unit}|${left.resolution}`;
      const rightKey = `${right.category}|${right.partNumber}|${right.unit}|${right.resolution}`;
      return leftKey.localeCompare(rightKey);
    });

  const unresolved = lines.filter((line) => line.resolution !== "resolved").length;
  return {
    revisionId: revision.id,
    libraryVersion: revision.libraryVersion,
    lines,
    summary: {
      totalLines: lines.length,
      resolved: lines.length - unresolved,
      unresolved
    }
  };
}
