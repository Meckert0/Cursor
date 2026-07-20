import type { LibraryComponentIngestItem, LibraryComponentRecord } from "./library.js";

/**
 * Structured compatibility attributes consumed by the rules engine.
 * Values come from first-class LibraryComponentRecord columns (Priority 3).
 */
export interface LibraryCompatibility {
  pinCount?: number;
  pinIds?: string[];
  acceptedAwgMin?: number;
  acceptedAwgMax?: number;
  acceptedFamilies?: string[];
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseAwgNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.trim().match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function readCustom(values: Record<string, string> | undefined, keys: string[]): string | undefined {
  if (!values) {
    return undefined;
  }
  for (const key of keys) {
    const value = values[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Promote legacy customFieldValues compatibility keys into first-class fields
 * when the first-class value is absent (ingest/update write-path only).
 */
export function promoteCompatibilityFields<T extends Partial<LibraryComponentIngestItem>>(
  input: T
): T & Pick<LibraryComponentIngestItem, "pinCount" | "pinIds" | "acceptedAwgMin" | "acceptedAwgMax" | "acceptedFamilies"> {
  const values = input.customFieldValues ?? {};
  const pinCount = input.pinCount ?? parsePositiveInt(readCustom(values, ["pinCount", "pin_count", "pincount"]));
  const pinIds = input.pinIds ?? parseList(readCustom(values, ["pinIds", "pin_ids", "pins"]));
  const acceptedAwgMin =
    input.acceptedAwgMin ?? parseAwgNumber(readCustom(values, ["acceptedAwgMin", "accepted_awg_min"]));
  const acceptedAwgMax =
    input.acceptedAwgMax ?? parseAwgNumber(readCustom(values, ["acceptedAwgMax", "accepted_awg_max"]));
  const acceptedFamilies =
    input.acceptedFamilies ?? parseList(readCustom(values, ["acceptedFamilies", "accepted_families"]));

  return {
    ...input,
    pinCount,
    pinIds,
    acceptedAwgMin,
    acceptedAwgMax,
    acceptedFamilies
  };
}

export function resolveLibraryCompatibility(component: LibraryComponentRecord): LibraryCompatibility {
  return {
    pinCount: component.pinCount,
    pinIds: component.pinIds && component.pinIds.length > 0 ? component.pinIds : undefined,
    acceptedAwgMin: component.acceptedAwgMin,
    acceptedAwgMax: component.acceptedAwgMax,
    acceptedFamilies:
      component.acceptedFamilies && component.acceptedFamilies.length > 0 ? component.acceptedFamilies : undefined
  };
}

export function parseWireAwg(value: string | undefined): number | undefined {
  return parseAwgNumber(value);
}

export function awgInAcceptedRange(
  awg: number,
  range: { acceptedAwgMin?: number; acceptedAwgMax?: number }
): boolean {
  if (range.acceptedAwgMin !== undefined && awg < range.acceptedAwgMin) {
    return false;
  }
  if (range.acceptedAwgMax !== undefined && awg > range.acceptedAwgMax) {
    return false;
  }
  return true;
}

export function familyAccepted(family: string | undefined, acceptedFamilies: string[] | undefined): boolean {
  if (!acceptedFamilies || acceptedFamilies.length === 0) {
    return true;
  }
  if (!family?.trim()) {
    return false;
  }
  const normalized = family.trim().toLowerCase();
  return acceptedFamilies.some((entry) => entry.trim().toLowerCase() === normalized);
}
