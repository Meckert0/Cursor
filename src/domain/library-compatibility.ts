import type {
  ContactAttributes,
  ModuleAttributes,
  PartWithAttributes
} from "./library.js";

/**
 * Structured compatibility attributes consumed by the rules engine.
 * Values come from typed extension attributes on PartWithAttributes.
 */
export interface LibraryCompatibility {
  pinCount?: number;
  pinIds?: string[];
  acceptedAwgMin?: number;
  acceptedAwgMax?: number;
  acceptedFamilies?: string[];
}

export function resolveLibraryCompatibility(part: PartWithAttributes): LibraryCompatibility {
  if (part.category === "module") {
    const attrs = part.attributes as ModuleAttributes;
    return {
      pinCount: attrs.pinCount,
      pinIds: attrs.pinIds && attrs.pinIds.length > 0 ? attrs.pinIds : undefined
    };
  }
  if (part.category === "contact") {
    const attrs = part.attributes as ContactAttributes;
    return {
      acceptedAwgMin: attrs.acceptedAwgMin,
      acceptedAwgMax: attrs.acceptedAwgMax,
      acceptedFamilies:
        attrs.acceptedFamilies && attrs.acceptedFamilies.length > 0 ? attrs.acceptedFamilies : undefined
    };
  }
  return {};
}

export function parseWireAwg(value: string | undefined): number | undefined {
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
