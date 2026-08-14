/**
 * Normalization rules for CPQMatricesInfo.xlsx values.
 *
 * The workbook uses a mix of sentinel values for "no data": empty cells, 0,
 * -1, 999, "NotFound", "NotAvailable", "NA", "Multiple", "Unknown". Every
 * accessor here maps those to undefined so builders only see real values.
 */

export type CellValue = string | number | boolean | null;

const SENTINEL_TEXT = new Set([
  "NOTFOUND",
  "NOTAVAILABLE",
  "NA",
  "N/A",
  "UNKNOWN",
  "MULTIPLE",
  "DEFAULT VALUE"
]);

const DEFAULT_SENTINEL_NUMBERS = new Set([-1, 999]);

/**
 * Excel floats carry representation noise (6.7999999999999996E-3). Six
 * significant digits preserves every legitimate value in the workbook
 * (dias, weights, k-factors) while discarding the noise.
 */
export function roundNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  if (value === 0) {
    return 0;
  }
  return Number(value.toPrecision(6));
}

/** Trim + collapse internal whitespace; sentinel text and empties become undefined. */
export function cleanText(value: CellValue): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim().replace(/\s+/g, " ");
  if (text.length === 0) {
    return undefined;
  }
  if (SENTINEL_TEXT.has(text.toUpperCase())) {
    return undefined;
  }
  return text;
}

/** cleanText that additionally treats a literal 0 / "0" as no-data (key and text columns). */
export function textOrUndefined(value: CellValue): string | undefined {
  const text = cleanText(value);
  if (text === undefined || text === "0") {
    return undefined;
  }
  return text;
}

export function numberOrUndefined(
  value: CellValue,
  options?: { zeroIsNull?: boolean; sentinels?: ReadonlySet<number> }
): number | undefined {
  const sentinels = options?.sentinels ?? DEFAULT_SENTINEL_NUMBERS;
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else {
    const text = cleanText(value);
    if (text === undefined) {
      return undefined;
    }
    numeric = Number(text);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }
  }
  if (sentinels.has(numeric)) {
    return undefined;
  }
  if (numeric === 0 && options?.zeroIsNull) {
    return undefined;
  }
  return roundNumber(numeric);
}

export function intOrUndefined(
  value: CellValue,
  options?: { zeroIsNull?: boolean }
): number | undefined {
  const numeric = numberOrUndefined(value, options);
  if (numeric === undefined || !Number.isInteger(numeric)) {
    return undefined;
  }
  return numeric;
}

export function boolOrUndefined(value: CellValue): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  const text = cleanText(value)?.toUpperCase();
  if (text === undefined) {
    return undefined;
  }
  if (text === "Y" || text === "YES" || text === "TRUE") {
    return true;
  }
  if (text === "N" || text === "NO" || text === "FALSE") {
    return false;
  }
  return undefined;
}

/**
 * Canonical part number: trimmed, uppercased, and with the trailing "PP"
 * packaging suffix stripped (PP variants are the same physical part).
 */
export function normalizePartNumber(value: CellValue): string | undefined {
  const text = textOrUndefined(value);
  if (text === undefined) {
    return undefined;
  }
  const upper = text.toUpperCase().replace(/\s+/g, "");
  const stripped = upper.endsWith("PP") && upper.length > 2 ? upper.slice(0, -2) : upper;
  return stripped.length > 0 ? stripped : undefined;
}

/** Gender enum drift: "ML " -> "ML", "ML(PIN)" -> "ML"; compound values kept verbatim. */
export function normalizeGender(value: CellValue): string | undefined {
  const text = textOrUndefined(value);
  if (text === undefined) {
    return undefined;
  }
  const upper = text.toUpperCase();
  if (upper === "ML(PIN)") {
    return "ML";
  }
  return upper;
}

/** Wire type drift: "Twisted Pair" -> "TwistedPair". */
export function normalizeWireType(value: CellValue): string | undefined {
  const text = textOrUndefined(value);
  return text?.replace(/\s+/g, "");
}

/** Lowercased alphanumeric-only form used for fuzzy name matching. */
export function compactName(value: CellValue): string | undefined {
  const text = textOrUndefined(value);
  if (text === undefined) {
    return undefined;
  }
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact.length > 0 ? compact : undefined;
}
