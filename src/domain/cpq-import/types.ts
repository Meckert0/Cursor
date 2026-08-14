import type { LibraryCategory } from "../library.js";
import type { CellValue } from "./normalize.js";

export interface SheetRow {
  /** 1-based row number in the source sheet. */
  row: number;
  cells: Record<string, CellValue>;
}

export interface SheetData {
  name: string;
  rows: SheetRow[];
}

export type CpqWorkbook = Map<string, SheetData>;

export interface ImportException {
  sheet: string;
  row?: number;
  kind: string;
  detail: string;
}

export interface SheetStats {
  dataRows: number;
  outcomes: Record<string, number>;
}

export interface BuildContext {
  exceptions: ImportException[];
  stats: Map<string, SheetStats>;
}

export function createContext(): BuildContext {
  return { exceptions: [], stats: new Map() };
}

export function initSheet(ctx: BuildContext, sheet: string, dataRows: number): void {
  ctx.stats.set(sheet, { dataRows, outcomes: {} });
}

export function recordOutcome(ctx: BuildContext, sheet: string, outcome: string, count = 1): void {
  const stats = ctx.stats.get(sheet);
  if (!stats) {
    ctx.stats.set(sheet, { dataRows: 0, outcomes: { [outcome]: count } });
    return;
  }
  stats.outcomes[outcome] = (stats.outcomes[outcome] ?? 0) + count;
}

export function addException(
  ctx: BuildContext,
  sheet: string,
  kind: string,
  detail: string,
  row?: number
): void {
  ctx.exceptions.push({ sheet, row, kind, detail });
}

/** True when the row is one of the workbook's "Default Value" template rows. */
export function isDefaultValueRow(row: SheetRow): boolean {
  return Object.values(row.cells).some(
    (value) => typeof value === "string" && value.trim().toLowerCase() === "default value"
  );
}

export interface AliasCandidate {
  codeSystem: string;
  code: string;
  partId: string;
  sheet: string;
  row: number;
}

export interface CatalogPart {
  id: string;
  category: LibraryCategory;
  family: string;
  partNumber: string;
  description: string;
  attributes: Record<string, unknown>;
  flaggedForReview: boolean;
  /** sheet:row provenance entries, for the reconciliation report. */
  sources: string[];
}

export function getSheet(workbook: CpqWorkbook, name: string, ctx: BuildContext): SheetData {
  const sheet = workbook.get(name);
  if (!sheet) {
    addException(ctx, name, "sheet-missing", `Sheet "${name}" not found in workbook.`);
    return { name, rows: [] };
  }
  return sheet;
}
