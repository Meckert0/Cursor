import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

export const WIRELIST_TEMPLATE_COLUMN_COUNT = 15;
export const BOM_COLUMN_COUNT = 8;
const WIRELIST_SHEET_XML_PATH = "xl/worksheets/sheet1.xml";
const BOM_SHEET_XML_PATH = "xl/worksheets/sheet2.xml";
const WIRELIST_WORKBOOK_XML_PATH = "xl/workbook.xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const TEMPLATE_DATA_START_ROW = 2;
const EMPTY_CELL_DISPLAY = "-";

const BOM_HEADERS = ["Item", "Category", "Part Number", "Description", "Qty", "Unit", "Status", "Used By"];
const FIXED_ZIP_ENTRY_DATE = new Date("2000-01-01T00:00:00.000Z");

export function resolveWirelistTemplatePath(): string {
  const fromModule = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/wirelist-template.xlsx");
  const candidates = [
    process.env.WIRELIST_TEMPLATE_PATH,
    fromModule,
    path.resolve(process.cwd(), "data/wirelist-template.xlsx"),
    path.resolve(process.cwd(), "../../data/wirelist-template.xlsx"),
    path.resolve("/var/task/data/wirelist-template.xlsx")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Wirelist template file not found.");
}

function columnLetter(columnIndex1Based: number): string {
  let column = columnIndex1Based;
  let letters = "";
  while (column > 0) {
    const remainder = (column - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    column = Math.floor((column - 1) / 26);
  }
  return letters;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeCellValue(value: string | number): string | number {
  if (value === "" || value === null || value === undefined) {
    return EMPTY_CELL_DISPLAY;
  }
  return value;
}

function formatCellXml(cellRef: string, attrs: string, value: string | number): string {
  const normalizedValue = normalizeCellValue(value);
  const normalizedAttrs = attrs.trim() ? ` ${attrs.trim()}` : "";
  if (typeof normalizedValue === "number") {
    return `<c r="${cellRef}"${normalizedAttrs}><v>${normalizedValue}</v></c>`;
  }
  return `<c r="${cellRef}"${normalizedAttrs} t="inlineStr"><is><t>${escapeXml(String(normalizedValue))}</t></is></c>`;
}

function sanitizeCellAttrs(attrs: string): string {
  return attrs
    .replace(/\/\s*$/g, "")
    .replace(/\bt="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getColumnStyleAttrs(sheetXml: string, columnIndex: number, prototypeRowNumber = TEMPLATE_DATA_START_ROW): string {
  const cellRef = `${columnLetter(columnIndex)}${prototypeRowNumber}`;
  const match = sheetXml.match(new RegExp(`<c r="${cellRef}"([^/>]*)(?:/>|>)`));
  const attrs = sanitizeCellAttrs(match?.[1] ?? "");
  return attrs || 's="5"';
}

function getRowAttrs(sheetXml: string, rowNumber: number): string {
  const match = sheetXml.match(new RegExp(`<row r="${rowNumber}"([^>]*)>`));
  return match?.[1] ?? ' spans="1:15"';
}

function buildDataRowXml(
  rowNumber: number,
  rowAttrs: string,
  rowValues: Array<string | number>,
  sheetXml: string
): string {
  const cells: string[] = [];
  for (let columnIndex = 1; columnIndex <= WIRELIST_TEMPLATE_COLUMN_COUNT; columnIndex += 1) {
    const cellRef = `${columnLetter(columnIndex)}${rowNumber}`;
    cells.push(
      formatCellXml(cellRef, getColumnStyleAttrs(sheetXml, columnIndex), rowValues[columnIndex - 1] ?? "")
    );
  }
  return `<row r="${rowNumber}"${rowAttrs}>${cells.join("")}</row>`;
}

function fillSheetXml(sheetXml: string, dataRows: Array<Array<string | number>>): string {
  const prototypeRowAttrs = getRowAttrs(sheetXml, TEMPLATE_DATA_START_ROW);
  let updatedSheetXml = sheetXml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (full, rowNumStr, rowAttrs, _rowInner) => {
    const rowNum = Number(rowNumStr);
    const dataIndex = rowNum - TEMPLATE_DATA_START_ROW;
    if (dataIndex < 0 || dataIndex >= dataRows.length) {
      return full;
    }
    return buildDataRowXml(rowNum, rowAttrs, dataRows[dataIndex], sheetXml);
  });

  const existingRowNumbers = [...updatedSheetXml.matchAll(/<row r="(\d+)"/g)].map((match) => Number(match[1]));
  const maxExistingRow = Math.max(...existingRowNumbers, 1);
  const lastDataRowNumber = dataRows.length + 1;

  if (lastDataRowNumber > maxExistingRow) {
    const extraRows = dataRows
      .slice(maxExistingRow - 1)
      .map((rowValues, offset) =>
        buildDataRowXml(maxExistingRow + 1 + offset, prototypeRowAttrs, rowValues, sheetXml)
      )
      .join("");
    updatedSheetXml = updatedSheetXml.replace("</sheetData>", `${extraRows}</sheetData>`);
  }

  return updatedSheetXml;
}

function updateSheetExtent(sheetXml: string, lastRow: number): string {
  const lastCell = `O${lastRow}`;
  return sheetXml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${lastCell}"/>`);
}

function updateWorkbookRanges(workbookXml: string, lastRow: number): string {
  return workbookXml
    .replace(
      /(<definedName name="_xlnm\.Print_Area" localSheetId="0">Wirelist!\$A\$1:\$O\$)\d+(<\/definedName>)/,
      `$1${lastRow}$2`
    )
    .replace(
      /(<definedName name="_xlnm\._FilterDatabase" localSheetId="0" hidden="1">Wirelist!\$C\$2:\$C\$)\d+(<\/definedName>)/,
      `$1${lastRow}$2`
    );
}

function buildBomSheetXml(bomRows: Array<Array<string | number>>): string {
  const lastRow = Math.max(bomRows.length + 1, 1);
  const headerCells = BOM_HEADERS.map((header, index) =>
    formatCellXml(`${columnLetter(index + 1)}1`, "", header)
  ).join("");
  const dataRowsXml = bomRows
    .map((rowValues, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = Array.from({ length: BOM_COLUMN_COUNT }, (_, columnIndex) =>
        formatCellXml(`${columnLetter(columnIndex + 1)}${rowNumber}`, "", rowValues[columnIndex] ?? "")
      ).join("");
      return `<row r="${rowNumber}" spans="1:${BOM_COLUMN_COUNT}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:H${lastRow}"/>
  <sheetData>
    <row r="1" spans="1:${BOM_COLUMN_COUNT}">${headerCells}</row>
    ${dataRowsXml}
  </sheetData>
</worksheet>`;
}

function ensureBomSheetInWorkbook(workbookXml: string): string {
  if (workbookXml.includes('name="BOM"')) {
    return workbookXml;
  }
  return workbookXml.replace(
    /<sheets>([\s\S]*?)<\/sheets>/,
    (_full, inner: string) => `<sheets>${inner}<sheet name="BOM" sheetId="2" r:id="rIdBom"/></sheets>`
  );
}

function ensureBomSheetRelationship(relsXml: string): string {
  if (relsXml.includes('Id="rIdBom"') || relsXml.includes("worksheets/sheet2.xml")) {
    return relsXml;
  }
  return relsXml.replace(
    "</Relationships>",
    `<Relationship Id="rIdBom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`
  );
}

function ensureBomContentType(contentTypesXml: string): string {
  if (contentTypesXml.includes('PartName="/xl/worksheets/sheet2.xml"')) {
    return contentTypesXml;
  }
  return contentTypesXml.replace(
    "</Types>",
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  );
}

export async function buildWirelistXlsxFromTemplateRows(
  dataRows: Array<Array<string | number>>,
  bomRows: Array<Array<string | number>> = []
): Promise<Buffer> {
  const templatePath = resolveWirelistTemplatePath();
  const templateBuffer = readFileSync(templatePath);
  const zip = new AdmZip(templateBuffer);
  const sheetEntry = zip.getEntry(WIRELIST_SHEET_XML_PATH);
  if (!sheetEntry) {
    throw new Error("Wirelist worksheet XML not found in template.");
  }

  const workbookEntry = zip.getEntry(WIRELIST_WORKBOOK_XML_PATH);
  if (!workbookEntry) {
    throw new Error("Workbook XML not found in template.");
  }

  const relsEntry = zip.getEntry(WORKBOOK_RELS_PATH);
  if (!relsEntry) {
    throw new Error("Workbook relationships XML not found in template.");
  }

  const contentTypesEntry = zip.getEntry(CONTENT_TYPES_PATH);
  if (!contentTypesEntry) {
    throw new Error("Content types XML not found in template.");
  }

  const lastRow = Math.max(dataRows.length + 1, 1);
  const sheetXml = zip.readAsText(sheetEntry);
  const filledSheetXml = updateSheetExtent(fillSheetXml(sheetXml, dataRows), lastRow);
  const workbookXml = ensureBomSheetInWorkbook(updateWorkbookRanges(zip.readAsText(workbookEntry), lastRow));
  const relsXml = ensureBomSheetRelationship(zip.readAsText(relsEntry));
  const contentTypesXml = ensureBomContentType(zip.readAsText(contentTypesEntry));
  const bomSheetXml = buildBomSheetXml(bomRows);

  zip.updateFile(WIRELIST_SHEET_XML_PATH, Buffer.from(filledSheetXml, "utf8"));
  zip.updateFile(WIRELIST_WORKBOOK_XML_PATH, Buffer.from(workbookXml, "utf8"));
  zip.updateFile(WORKBOOK_RELS_PATH, Buffer.from(relsXml, "utf8"));
  zip.updateFile(CONTENT_TYPES_PATH, Buffer.from(contentTypesXml, "utf8"));
  zip.addFile(BOM_SHEET_XML_PATH, Buffer.from(bomSheetXml, "utf8"));

  // AdmZip stamps entry mtimes with "now" by default; pin them so content hashes are stable.
  for (const entry of zip.getEntries()) {
    entry.header.time = FIXED_ZIP_ENTRY_DATE;
  }

  return zip.toBuffer();
}
