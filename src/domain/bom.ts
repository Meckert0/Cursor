import type { LibraryCategory, PartAlias, PartWithAttributes } from "./library.js";
import { isSleeveTubeBraidPart, isWirePart } from "./library.js";
import { isFrameHousingConnector, isSlotPopulated } from "./connector-frames.js";
import { isWireRunPath, pinMappedPathIds } from "./path-roles.js";
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
  byId(id: string): PartWithAttributes | undefined;
  byPartNumber(partNumber: string, category?: LibraryCategory | LibraryCategory[]): PartWithAttributes | undefined;
  listByCategory?(category: LibraryCategory): PartWithAttributes[];
}

export function createLibraryLookup(
  components: PartWithAttributes[],
  aliases: PartAlias[] = []
): LibraryLookup {
  const byId = new Map(components.map((component) => [component.id, component]));
  const byPartNumber = new Map<string, PartWithAttributes[]>();
  const byCategory = new Map<LibraryCategory, PartWithAttributes[]>();
  const byAliasCode = new Map<string, PartWithAttributes[]>();
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
  for (const alias of aliases) {
    const part = byId.get(alias.partId);
    if (!part) {
      continue;
    }
    const key = normalizePartNumber(alias.code);
    if (!key) {
      continue;
    }
    const existing = byAliasCode.get(key) ?? [];
    existing.push(part);
    byAliasCode.set(key, existing);
  }

  function pickMatch(
    matches: PartWithAttributes[],
    category?: LibraryCategory | LibraryCategory[]
  ): PartWithAttributes | undefined {
    if (!category) {
      return matches[0];
    }
    const categories = Array.isArray(category) ? category : [category];
    return matches.find((component) => categories.includes(component.category));
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
      const byPn = pickMatch(byPartNumber.get(key) ?? [], category);
      if (byPn) {
        return byPn;
      }
      return pickMatch(byAliasCode.get(key) ?? [], category);
    },
    listByCategory(category: LibraryCategory) {
      return byCategory.get(category) ?? [];
    }
  };
}

function normalizePartNumber(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolutionFor(component: PartWithAttributes | undefined): BomResolution {
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
): PartWithAttributes | undefined {
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
): PartWithAttributes | undefined {
  const styleNeedle = sleeving.toLowerCase();
  return (lookup.listByCategory?.("sleeve-tube-braid") ?? []).find((component) => {
    if (!isSleeveTubeBraidPart(component)) {
      return false;
    }
    // Sleeve style lives on parts.family after migration 028 (no sleeve_style column).
    const style = component.family?.trim().toLowerCase();
    if (!style) {
      return false;
    }
    return style === styleNeedle || style.includes(styleNeedle) || styleNeedle.includes(style);
  });
}

function emitConnectorPartLine(
  aggregates: Map<AggregateKey, AggregateLine>,
  input: {
    designRef: string;
    partNumber?: string;
    libraryComponentId?: string;
    categories: LibraryCategory | LibraryCategory[];
    missingLabel: string;
    lookup: LibraryLookup;
  }
) {
  const partNumber = input.partNumber?.trim();
  if (!partNumber && !input.libraryComponentId) {
    upsertAggregate(aggregates, {
      category: "connector",
      partNumber: `(unspecified:${input.designRef})`,
      description: `${input.missingLabel} ${input.designRef} has no part number`,
      quantity: 1,
      unit: "ea",
      resolution: "not_found",
      designRef: input.designRef,
      notes: `Missing ${input.missingLabel.toLowerCase()} part number`
    });
    return;
  }
  const component = resolveComponent(input.lookup, {
    libraryComponentId: input.libraryComponentId,
    partNumber,
    categories: input.categories
  });
  const resolvedPartNumber = component?.partNumber ?? partNumber ?? input.libraryComponentId ?? "UNKNOWN";
  upsertAggregate(aggregates, {
    category: component?.category ?? "connector",
    partNumber: resolvedPartNumber,
    description: component?.description ?? `${input.missingLabel} ${input.designRef}`,
    family: component?.family,
    quantity: 1,
    unit: "ea",
    resolution: resolutionFor(component),
    libraryComponentId: component?.id ?? input.libraryComponentId,
    designRef: input.designRef
  });
}

export function buildBom(revision: Revision, lookup: LibraryLookup): BomResult {
  const aggregates = new Map<AggregateKey, AggregateLine>();
  const snapshot: DesignSnapshot = revision.snapshot;

  for (const connector of snapshot.connectors) {
    if (isFrameHousingConnector(connector)) {
      emitConnectorPartLine(aggregates, {
        designRef: connector.reference,
        partNumber: connector.partNumber,
        libraryComponentId: connector.libraryComponentId,
        categories: "frame",
        missingLabel: "Frame",
        lookup
      });
      for (const slot of connector.slots ?? []) {
        if (!isSlotPopulated(slot)) {
          continue;
        }
        emitConnectorPartLine(aggregates, {
          designRef: slot.reference,
          partNumber: slot.partNumber,
          libraryComponentId: slot.libraryComponentId,
          categories: ["module", "contact"],
          missingLabel: "Module",
          lookup
        });
        emitAccessoryLine(aggregates, {
          connectorReference: slot.reference,
          category: "backshell",
          partNumber: slot.backshellPartNumber,
          libraryComponentId: slot.backshellLibraryComponentId,
          lookup,
          missingLabel: "Backshell"
        });
        emitAccessoryLine(aggregates, {
          connectorReference: slot.reference,
          category: "strain-relief",
          partNumber: slot.strainReliefPartNumber,
          libraryComponentId: slot.strainReliefLibraryComponentId,
          lookup,
          missingLabel: "Strain relief"
        });
      }
      continue;
    }

    emitConnectorPartLine(aggregates, {
      designRef: connector.reference,
      partNumber: connector.partNumber,
      libraryComponentId: connector.libraryComponentId,
      categories: ["module", "contact"],
      missingLabel: "Connector",
      lookup
    });
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
    if (!isWireRunPath(path, pinMappedPathIds(snapshot.pinMappings))) {
      continue;
    }
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
      const awg =
        path.wireAwg?.trim() ||
        (component && isWirePart(component) ? component.attributes.awg.trim() : undefined) ||
        undefined;
      const color =
        path.wireColor?.trim() ||
        (component && isWirePart(component) ? component.attributes.color.trim() : undefined) ||
        undefined;
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
