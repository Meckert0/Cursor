import { normalizeWireAttributes } from "./catalog-attributes.js";
import type {
  ContactAttributes,
  ModuleAttributes,
  WireAttributes,
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
  acceptedGauges?: string[];
  wireInterface?: string;
  acceptedInsulationDiaMinIn?: number;
  acceptedInsulationDiaMaxIn?: number;
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
      ...(attrs.acceptedGauges?.length ? { acceptedGauges: attrs.acceptedGauges } : {}),
      ...(attrs.wireInterface ? { wireInterface: attrs.wireInterface } : {}),
      ...(attrs.acceptedInsulationDiaMinIn !== undefined ? { acceptedInsulationDiaMinIn: attrs.acceptedInsulationDiaMinIn } : {}),
      ...(attrs.acceptedInsulationDiaMaxIn !== undefined ? { acceptedInsulationDiaMaxIn: attrs.acceptedInsulationDiaMaxIn } : {}),
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
  const match = value.trim().match(/^(?:AWG\s*)?(\d+(?:\.\d+)?)(?:\s*AWG)?$/i);
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

/** A profile match is dimensional evidence; explicit approvals remain relationships. */
export function contactWireFit(contact: LibraryCompatibility, rawWire: WireAttributes, family?: string, gaugeOverride?: string): "fits" | "incompatible" | "unknown" {
  const wire = normalizeWireAttributes(rawWire);
  const normalize = (value: string) => value.toUpperCase().replace(/AWG|[\s-]/g, "");
  let unknown = false;
  const gauge = gaugeOverride ?? wire.awg;
  if (contact.acceptedGauges?.length) {
    const candidates = [gauge, wire.cableDesignation].filter((value): value is string => !!value).map(normalize);
    if (!candidates.length) unknown = true;
    else if (!contact.acceptedGauges.some(accepted => candidates.includes(normalize(accepted)))) return "incompatible";
  } else if (contact.acceptedAwgMin !== undefined || contact.acceptedAwgMax !== undefined) {
    const awg = parseWireAwg(gauge);
    if (awg === undefined) unknown = true;
    else if (!awgInAcceptedRange(awg, contact)) return "incompatible";
  }
  if (contact.acceptedFamilies?.length) {
    if (!family) unknown = true;
    else if (!familyAccepted(family, contact.acceptedFamilies)) return "incompatible";
  }
  const interfaceType = (contact.wireInterface ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const construction = (wire.construction ?? wire.wireType ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (["wire", "singlewire", "discretewire"].includes(interfaceType) && (construction.includes("coax") || construction.includes("twinax") || /^RG/i.test(wire.cableDesignation ?? ""))) return "incompatible";
  if (["coax", "coaxial", "twinax"].includes(interfaceType)) {
    if (!construction && !wire.cableDesignation) unknown = true;
    else if (interfaceType === "twinax" ? !construction.includes("twinax") : !(construction.includes("coax") || /^RG/i.test(wire.cableDesignation ?? ""))) return "incompatible";
  }
  if (contact.acceptedInsulationDiaMinIn !== undefined || contact.acceptedInsulationDiaMaxIn !== undefined) {
    const diameter = wire.insulatedConductorDiaIn ?? (!wire.cableDesignation && (wire.numberOfConductors === 1 || construction === "single") ? wire.overallDia : undefined);
    if (diameter === undefined) unknown = true;
    else if ((contact.acceptedInsulationDiaMinIn !== undefined && diameter < contact.acceptedInsulationDiaMinIn) || (contact.acceptedInsulationDiaMaxIn !== undefined && diameter > contact.acceptedInsulationDiaMaxIn)) return "incompatible";
  }
  return unknown ? "unknown" : "fits";
}
