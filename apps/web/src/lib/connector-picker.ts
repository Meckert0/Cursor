import type { LibraryComponentDto } from "./api";
import { isCanvasConnectorPart, isCanvasFramePart } from "./part-fields";
import { normalizeCatalogSide } from "./connector-frames";

export type PickerValue = string | number | null;
export type PickerMode = "connector" | "frame";

export function isPickerPart(part: LibraryComponentDto, mode: PickerMode): boolean {
  return mode === "frame" ? isCanvasFramePart(part) : isCanvasConnectorPart(part);
}
export type PickerColumnId =
  | "partNumber" | "description" | "type" | "family" | "side" | "positions"
  | "stockStatus" | "reviewStatus" | "gender" | "moduleCapacity"
  | "contactFamily" | "contactSize" | "emi";

export interface PickerColumn {
  id: PickerColumnId;
  label: string;
  kind: "text" | "values" | "number";
  width: number;
  value: (part: LibraryComponentDto) => PickerValue;
  applies?: (part: LibraryComponentDto) => boolean;
}

export type PickerFilter =
  | { kind: "text"; operator: "contains" | "equals" | "starts"; value: string }
  | { kind: "values"; values: string[] }
  | { kind: "number"; mode: "range" | "missing" | "notApplicable"; min: string; max: string };
export type PickerFilters = Partial<Record<PickerColumnId, PickerFilter>>;
export interface PickerSort { id: PickerColumnId; direction: "asc" | "desc" }
export interface PickerRecord {
  part: LibraryComponentDto;
  values: Record<PickerColumnId, PickerValue>;
  searchText: string;
  partNumber: string;
}

const stockLabels: Record<LibraryComponentDto["stockStatus"], string> = {
  in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock", unknown: "Unknown"
};
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const isModule = (part: LibraryComponentDto) => part.category === "module";
const isFrame = (part: LibraryComponentDto) => isCanvasFramePart(part);

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return String(value).trim() || null;
}

function wholeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number) && number >= 0 ? number : null;
}

function positions(part: LibraryComponentDto): number | null {
  if (!isModule(part)) return null;
  const explicit = wholeNumber(part.attributes.positionCount);
  if (explicit !== null) return explicit;
  const primary = wholeNumber(part.attributes.pinCount);
  const secondary = wholeNumber(part.attributes.pinCount2);
  if (primary !== null || secondary !== null) return (primary ?? 0) + (secondary ?? 0);
  return Array.isArray(part.attributes.pinIds) && part.attributes.pinIds.length ? part.attributes.pinIds.length : null;
}

function capacity(part: LibraryComponentDto): number | null {
  if (!isFrame(part)) return null;
  const explicit = wholeNumber(part.attributes.moduleCapacity);
  if (explicit !== null) return explicit;
  return Array.isArray(part.attributes.slotIds) && part.attributes.slotIds.length ? part.attributes.slotIds.length : null;
}

export const CONNECTOR_PICKER_COLUMNS: readonly PickerColumn[] = [
  { id: "partNumber", label: "Part number", kind: "text", width: 165, value: p => p.partNumber },
  { id: "description", label: "Description", kind: "text", width: 245, value: p => text(p.description) },
  { id: "type", label: "Type", kind: "values", width: 130, value: p => {
    if (!isFrame(p)) return "Module";
    const side = normalizeCatalogSide(p.partType);
    return side === "ITA" ? "ITA housing" : side === "RECEIVER" ? "Receiver housing" : "Frame";
  } },
  { id: "family", label: "Family", kind: "values", width: 100, value: p => text(p.family) },
  { id: "side", label: "Side", kind: "values", width: 110, value: p => {
    const side = normalizeCatalogSide(p.side);
    return side === "RECEIVER" ? "Receiver" : side === "DUAL" ? "Dual" : side || "Unspecified";
  } },
  { id: "positions", label: "Positions", kind: "number", width: 115, value: positions, applies: isModule },
  { id: "stockStatus", label: "Availability", kind: "values", width: 135, value: p => stockLabels[p.stockStatus] ?? "Unknown" },
  { id: "reviewStatus", label: "Review status", kind: "values", width: 145, value: p => p.isReviewed ? "Reviewed" : "Awaiting review" },
  { id: "gender", label: "Gender", kind: "values", width: 115, value: p => text(p.attributes.gender), applies: isModule },
  { id: "moduleCapacity", label: "Module capacity", kind: "number", width: 145, value: capacity, applies: isFrame },
  { id: "contactFamily", label: "Contact family", kind: "values", width: 140, value: p => [text(p.attributes.contactFamily1), text(p.attributes.contactFamily2)].filter(Boolean).join(" / ") || null, applies: isModule },
  { id: "contactSize", label: "Contact size", kind: "values", width: 125, value: p => text(p.attributes.contactSize), applies: isModule },
  { id: "emi", label: "EMI shielding", kind: "values", width: 135, value: p => {
    const value = p.attributes.emi;
    return value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : "Unknown";
  }, applies: isModule }
];

export const DEFAULT_PICKER_COLUMNS = CONNECTOR_PICKER_COLUMNS.slice(0, 8).map(c => c.id);
export const TOP_PICKER_FILTERS: readonly PickerColumnId[] = ["type", "family", "side", "positions", "stockStatus"];
export function pickerDefaultColumns(mode: PickerMode): PickerColumnId[] {
  return DEFAULT_PICKER_COLUMNS.map(id => mode === "frame" && id === "positions" ? "moduleCapacity" : id);
}
export function pickerTopFilters(mode: PickerMode): PickerColumnId[] {
  return TOP_PICKER_FILTERS.map(id => mode === "frame" && id === "positions" ? "moduleCapacity" : id);
}
export const pickerColumn = (id: PickerColumnId): PickerColumn => CONNECTOR_PICKER_COLUMNS.find(c => c.id === id)!;

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function compact(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

export function pickerQueryTokens(query: string): string[] {
  return [...normalize(query).matchAll(/"([^"]+)"|(\S+)/g)].map(match => match[1] ?? match[2]);
}

export function pickerDisplayValue(record: PickerRecord, column: PickerColumn): string {
  if (column.applies && !column.applies(record.part)) return "Not applicable";
  return record.values[column.id] === null ? "Not supplied" : String(record.values[column.id]);
}

export function buildPickerIndex(parts: readonly LibraryComponentDto[]): PickerRecord[] {
  return parts.map(part => {
    const values = Object.fromEntries(CONNECTOR_PICKER_COLUMNS.map(c => [c.id, c.applies && !c.applies(part) ? null : c.value(part)])) as PickerRecord["values"];
    const attributes = Object.values(part.attributes).flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => typeof value === "string" || typeof value === "number" || typeof value === "boolean");
    return {
      part, values, partNumber: compact(part.partNumber),
      searchText: normalize([...Object.values(values), part.partType, part.notes, ...attributes].join(" "))
    };
  });
}

export function isActivePickerFilter(filter: PickerFilter): boolean {
  if (filter.kind === "text") return !!filter.value.trim();
  if (filter.kind === "values") return filter.values.length > 0;
  return filter.mode !== "range" || filter.min !== "" || filter.max !== "";
}

export function pickerFilterError(filter: PickerFilter): string | null {
  if (filter.kind !== "number" || filter.mode !== "range") return null;
  if ([filter.min, filter.max].some(value => value !== "" && wholeNumber(value) === null)) {
    return "Use whole numbers of zero or more.";
  }
  if (filter.min !== "" && filter.max !== "" && Number(filter.min) > Number(filter.max)) {
    return "Minimum must be less than or equal to maximum.";
  }
  return null;
}

function matchesFilter(record: PickerRecord, id: PickerColumnId, filter: PickerFilter): boolean {
  if (!isActivePickerFilter(filter)) return true;
  const column = pickerColumn(id);
  const value = record.values[id];
  if (filter.kind === "values") return filter.values.includes(pickerDisplayValue(record, column));
  if (filter.kind === "text") {
    const clean = id === "partNumber" ? compact : normalize;
    const needle = clean(filter.value.trim()) || normalize(filter.value.trim());
    const haystack = id === "partNumber" && !compact(filter.value) ? normalize(String(value ?? "")) : clean(String(value ?? ""));
    return filter.operator === "equals" ? haystack === needle : filter.operator === "starts" ? haystack.startsWith(needle) : haystack.includes(needle);
  }
  if (pickerFilterError(filter)) return false;
  const applies = !column.applies || column.applies(record.part);
  if (filter.mode === "missing") return applies && value === null;
  if (filter.mode === "notApplicable") return !applies;
  if (!applies || typeof value !== "number") return false;
  return (filter.min === "" || value >= Number(filter.min)) && (filter.max === "" || value <= Number(filter.max));
}

function matchesQuery(record: PickerRecord, tokens: readonly string[]): boolean {
  return tokens.every(token => record.searchText.includes(token) || (compact(token).length > 0 && record.partNumber.includes(compact(token))));
}

function matchesFilters(record: PickerRecord, filters: PickerFilters, ignore?: PickerColumnId): boolean {
  return (Object.entries(filters) as [PickerColumnId, PickerFilter][]).every(([id, filter]) => id === ignore || matchesFilter(record, id, filter));
}

function unknown(value: PickerValue): boolean {
  return value === null || value === "Unknown" || value === "Unspecified" || value === "Not applicable" || value === "Not supplied";
}

export function getPickerResults(index: readonly PickerRecord[], query: string, filters: PickerFilters, sort: PickerSort | null): PickerRecord[] {
  const tokens = pickerQueryTokens(query);
  const numberQuery = compact(tokens.join(" "));
  const rank = (record: PickerRecord) => numberQuery && record.partNumber === numberQuery ? 0 : numberQuery && record.partNumber.startsWith(numberQuery) ? 1 : 2;
  return index.filter(record => matchesQuery(record, tokens) && matchesFilters(record, filters)).sort((a, b) => {
    let difference = 0;
    if (sort) {
      const av = a.values[sort.id], bv = b.values[sort.id];
      const au = unknown(av), bu = unknown(bv);
      if (au !== bu) return au ? 1 : -1;
      if (!au && !bu) {
        difference = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
        if (sort.direction === "desc") difference *= -1;
      }
    } else if (query.trim()) difference = rank(a) - rank(b);
    return difference || collator.compare(a.part.partNumber, b.part.partNumber) || collator.compare(a.part.id, b.part.id);
  });
}

export function getPickerFacetChoices(index: readonly PickerRecord[], query: string, filters: PickerFilters, id: PickerColumnId): Array<{ value: string; count: number }> {
  const tokens = pickerQueryTokens(query);
  const column = pickerColumn(id);
  const counts = new Map<string, number>();
  for (const record of index) {
    const value = pickerDisplayValue(record, column);
    if (!counts.has(value)) counts.set(value, 0);
    if (matchesQuery(record, tokens) && matchesFilters(record, filters, id)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const selected = filters[id];
  if (selected?.kind === "values") for (const value of selected.values) if (!counts.has(value)) counts.set(value, 0);
  return [...counts].sort(([a], [b]) => collator.compare(a, b)).map(([value, count]) => ({ value, count }));
}

export function newPickerFilter(column: PickerColumn): PickerFilter {
  return column.kind === "text" ? { kind: "text", operator: "contains", value: "" }
    : column.kind === "values" ? { kind: "values", values: [] }
      : { kind: "number", mode: "range", min: "", max: "" };
}

export function pickerFilterLabel(filter: PickerFilter): string {
  if (filter.kind === "values") return filter.values.join(", ");
  if (filter.kind === "text") return `${filter.operator === "equals" ? "is" : filter.operator === "starts" ? "starts with" : "contains"} ${filter.value}`;
  if (filter.mode === "missing") return "Not supplied";
  if (filter.mode === "notApplicable") return "Not applicable";
  return filter.min !== "" && filter.max !== "" ? `${filter.min}–${filter.max}` : filter.min !== "" ? `≥ ${filter.min}` : `≤ ${filter.max}`;
}
