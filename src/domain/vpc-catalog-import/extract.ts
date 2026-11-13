import XLSX from "xlsx";
import type { VpcCell, VpcSheetRow } from "./types.js";

export type VpcWorkbookSheets = {
  parts: VpcSheetRow[];
  compatibility: VpcSheetRow[];
  sheetNames: string[];
};

function rowsFromSheet(sheet: XLSX.WorkSheet | undefined): VpcSheetRow[] {
  if (!sheet) {
    return [];
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, VpcCell>>(sheet, {
    raw: true,
    defval: null,
    blankrows: false
  });
  const rows: VpcSheetRow[] = [];
  raw.forEach((cells, index) => {
    const hasData = Object.values(cells).some((value) => value !== null && String(value).trim() !== "");
    if (!hasData) {
      return;
    }
    rows.push({ row: index + 2, cells });
  });
  return rows;
}

function findSheet(workbook: XLSX.WorkBook, wanted: string): XLSX.WorkSheet | undefined {
  const exact = workbook.SheetNames.find((name) => name.trim().toUpperCase() === wanted);
  if (exact) return workbook.Sheets[exact];
  const copies = workbook.SheetNames.filter(
    (name) => name.trim().toUpperCase().replace(/^COPY OF\s+/, "") === wanted
  );
  if (copies.length > 1) throw new Error(`Workbook has multiple copies of the ${wanted} sheet`);
  return copies.length === 1 ? workbook.Sheets[copies[0]] : undefined;
}

export function extractVpcWorkbook(filePath: string): VpcWorkbookSheets {
  const workbook = XLSX.readFile(filePath);
  const parts = rowsFromSheet(findSheet(workbook, "PARTS"));
  const compatibility = rowsFromSheet(findSheet(workbook, "COMPATIBILITY"));
  if (parts.length === 0) {
    throw new Error(`Workbook is missing a PARTS sheet with data: ${filePath}`);
  }
  if (compatibility.length === 0) {
    throw new Error(`Workbook is missing a COMPATIBILITY sheet with data: ${filePath}`);
  }
  return {
    parts,
    compatibility,
    sheetNames: workbook.SheetNames
  };
}
