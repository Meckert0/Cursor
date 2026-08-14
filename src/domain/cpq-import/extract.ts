import XLSX from "xlsx";
import type { CellValue } from "./normalize.js";
import type { CpqWorkbook, SheetData, SheetRow } from "./types.js";

/**
 * Reads every sheet into row objects keyed by column letter. Fully blank rows
 * are dropped here; "Default Value" template rows are kept so the builders can
 * count them explicitly in the reconciliation report.
 */
export function extractWorkbook(filePath: string): CpqWorkbook {
  const workbook = XLSX.readFile(filePath);
  const result: CpqWorkbook = new Map();
  for (const sheetName of workbook.SheetNames) {
    const raw = XLSX.utils.sheet_to_json<Record<string, CellValue>>(workbook.Sheets[sheetName], {
      header: "A",
      raw: true,
      defval: null,
      blankrows: true
    });
    const rows: SheetRow[] = [];
    raw.forEach((cells, index) => {
      const hasData = Object.values(cells).some((value) => value !== null);
      if (!hasData) {
        return;
      }
      rows.push({ row: index + 1, cells });
    });
    const sheet: SheetData = { name: sheetName, rows };
    result.set(sheetName, sheet);
  }
  return result;
}
