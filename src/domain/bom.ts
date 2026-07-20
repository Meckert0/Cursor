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
  awg?: string;
  color?: string;
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
  listByCategory?(category: LibraryCategory): LibraryComponentRecord[];
}

export function createLibraryLookup(components: LibraryComponentRecord[]): LibraryLookup {
  const byId = new Map(components.map((component) => [component.id, component]));
  const byPartNumber = new Map<string, LibraryComponentRecord[]>();
  const byCategory = new Map<LibraryCategory, LibraryComponentRecord[]>();
  for (const component of components) {
    const key = normalizePartNumber(component.partNumber);
    if (key) {
      const existing = byPartNumber.get(key) ?? [];
      existing.push(component);
      byPartNumber.set(key, existing);
    }
    const categoryItems = byCategory.get(component.category) ?? [];
    categoryItems.push(component);
    byCategory.set(component.category, categoryItems);
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
    },
    listByCategory(category: LibraryCategory) {
      return byCategory.get(category) ?? [];
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
  awg?: string;
  color?: string;
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
    awg?: string;
    color?: string;
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
      notes: input.notes,
      awg: input.awg,
      color: input.color
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
  if (!existing.awg && input.awg) {
    existing.awg = input.awg;
  }
  if (!existing.color && input.color) {
    existing.color = input.color;
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

function formatWireAwgColorNote(awg?: string, color?: string): string | undefined {
  const parts: string[] = [];
  if (awg?.trim()) {
    parts.push(`${awg.trim()} AWG`);
  }
  if (color?.trim()) {
    parts.push(color.trim());
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function emitAccessoryLine(
  aggregates: Map<AggregateKey, AggregateLine>,
  input: {
    connectorReference: string;
    category: LibraryCategory;
    partNumber?: string;
    libraryComponentId?: string;
    lookup: LibraryLookup;
    missingLabel: string;
  }
) {
  const partNumber = input.partNumber?.trim();
  if (!partNumber && !input.libraryComponentId) {
    return;
  }
  const component = resolveComponent(input.lookup, {
    libraryComponentId: input.libraryComponentId,
    partNumber,
    categories: input.category
  });
  const resolvedPartNumber = component?.partNumber ?? partNumber ?? input.libraryComponentId ?? "UNKNOWN";
  upsertAggregate(aggregates, {
    category: component?.category ?? input.category,
    partNumber: resolvedPartNumber,
    description: component?.description ?? `${input.missingLabel} ${resolvedPartNumber}`,
    family: component?.family,
    quantity: 1,
    unit: "ea",
    resolution: resolutionFor(component),
    libraryComponentId: component?.id ?? input.libraryComponentId,
    designRef: input.connectorReference
  });
}

function resolveSleevingComponent(
  lookup: LibraryLookup,
  sleeving: NonNullable<DesignSnapshot["paths"][number]["sleeving"]>
): LibraryComponentRecord | undefined {
  const hintNeedle = `maps to ${sleeving}`.toLowerCase();
  return (lookup.listByCategory?.("sleeve-tube-braid") ?? []).find((component) =>
    component.compatibilityHints.some((hint) => hint.toLowerCase().includes(hintNeedle))
  );
}

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
    } else {
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

    emitAccessoryLine(aggregates, {
      connectorReference: connector.reference,
      category: "backshell",
      partNumber: connector.backshellPartNumber,
      libraryComponentId: connector.backshellLibraryComponentId,
      lookup,
      missingLabel: "Backshell"
    });
    emitAccessoryLine(aggregates, {
      connectorReference: connector.reference,
      category: "strain-relief",
      partNumber: connector.strainReliefPartNumber,
      libraryComponentId: connector.strainReliefLibraryComponentId,
      lookup,
      missingLabel: "Strain relief"
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
      const awg = path.wireAwg?.trim() || component?.awg?.trim() || undefined;
      const color = path.wireColor?.trim() || component?.color?.trim() || undefined;
      const awgColorNote = formatWireAwgColorNote(awg, color);
      const lengthNote = hasLength ? undefined : "Path length missing; counted as 1 ea";
      const notes = [awgColorNote, lengthNote].filter(Boolean).join("; ") || undefined;
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
        notes,
        awg,
        color
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
      const component = resolveSleevingComponent(lookup, path.sleeving);
      if (component) {
        upsertAggregate(aggregates, {
          category: "sleeve-tube-braid",
          partNumber: component.partNumber,
          description: component.description,
          family: component.family,
          quantity,
          unit,
          resolution: resolutionFor(component),
          libraryComponentId: component.id,
          designRef: `run:${path.runNumber ?? path.id}`,
          notes: hasLength ? undefined : "Path length missing; counted as 1 ea"
        });
      } else {
        upsertAggregate(aggregates, {
          category: "sleeving",
          partNumber: path.sleeving,
          description: SLEEVING_LABELS[path.sleeving] ?? path.sleeving,
          quantity,
          unit,
          resolution: "not_found",
          designRef: `run:${path.runNumber ?? path.id}`,
          notes: hasLength
            ? "No sleeve-tube-braid library part mapped for this sleeving type"
            : "Path length missing; counted as 1 ea. No sleeve-tube-braid library part mapped for this sleeving type"
        });
      }
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
      notes: line.notes,
      awg: line.awg,
      color: line.color
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
