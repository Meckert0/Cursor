/** @vitest-environment node */
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import type { RevisionDto } from "./api";
import { buildWirelistXlsxFromTemplateRows } from "./wirelist-xlsx-from-template";
import { buildWirelistXlsxBuffer } from "./wirelist-xlsx-export";
import { snapshotToWirelistRows, WIRELIST_TEMPLATE_HEADERS } from "./wirelist-utils";

function readSharedStringXml(zip: AdmZip, index: number): string | null {
  const entry = zip.getEntry("xl/sharedStrings.xml");
  if (!entry) {
    return null;
  }
  const xml = zip.readAsText(entry);
  const matches = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
  return matches[index]?.[1] ?? null;
}

function readCellValue(zip: AdmZip, cellRef: string): string | number | null {
  const sheetXml = zip.readAsText("xl/worksheets/sheet1.xml");
  const cellMatch = sheetXml.match(new RegExp(`<c r="${cellRef}"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!cellMatch) {
    return null;
  }

  const attrs = cellMatch[1] ?? "";
  const inner = cellMatch[2] ?? "";
  if (!inner) {
    return null;
  }

  if (attrs.includes('t="inlineStr"')) {
    return inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? null;
  }
  if (attrs.includes('t="s"')) {
    const index = Number(inner.match(/<v>(\d+)<\/v>/)?.[1]);
    return Number.isFinite(index) ? readSharedStringXml(zip, index) : null;
  }

  const numeric = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (numeric === undefined) {
    return null;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : numeric;
}

describe("wirelist-xlsx-export", () => {
  const snapshot = {
    connectors: [
      { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
      { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
    ],
    junctions: [],
    paths: [
      {
        id: "p1",
        runNumber: 1,
        wireName: "wire1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "wire",
        length: 6.5,
        fromContact: "1",
        fromSignalDescription: "SRC",
        wireAwg: "22",
        wirePartNumber: "PN-ROUNDTRIP",
        wireColor: "white",
        wireGroup: "G1",
        toContact: "1",
        toSignalDescription: "DST",
        labelPartNumber: "LBL-1",
        labelText: "W1",
        notes: "Roundtrip"
      }
    ],
    pinMappings: [],
    bundles: [],
    annotations: []
  } as RevisionDto["snapshot"];

  it("fills the stored template workbook without rewriting its styles", async () => {
    const rows = snapshotToWirelistRows(snapshot);
    const buffer = await buildWirelistXlsxBuffer(rows);
    const zip = new AdmZip(buffer);
    const sheetXml = zip.readAsText("xl/worksheets/sheet1.xml");

    expect(zip.getEntry("xl/styles.xml")).toBeTruthy();
    expect(sheetXml).toContain('<c r="A1" s="1" t="s">');
    expect(readCellValue(zip, "A1")).toBe("Run #");
    expect(readCellValue(zip, "A2")).toBe(1);
    expect(readCellValue(zip, "B2")).toBe("J1");
    expect(readCellValue(zip, "F2")).toBe("PN-ROUNDTRIP");
    expect(readCellValue(zip, "H2")).toBe("white");
    expect(readCellValue(zip, "O2")).toBe("Roundtrip");

    const headerValues = WIRELIST_TEMPLATE_HEADERS.map((_, index) => readCellValue(zip, `${String.fromCharCode(65 + index)}1`));
    expect(headerValues).toEqual([...WIRELIST_TEMPLATE_HEADERS]);
    expect(sheetXml).toContain('<dimension ref="A1:O2"/>');
    expect(zip.readAsText("xl/workbook.xml")).toContain("Wirelist!$A$1:$O$2");
  });

  it("adds a Columns Counted sheet laid out like the Office Script output", async () => {
    const rows = snapshotToWirelistRows({
      ...snapshot,
      paths: [
        {
          ...snapshot.paths[0],
          id: "p1",
          runNumber: 1,
          fromContact: "100",
          toContact: "(100)",
          wirePartNumber: "WIRE-1",
          length: 24,
          labelPartNumber: "LBL-1",
          notes: "Add 555555 (2)"
        },
        {
          ...snapshot.paths[0],
          id: "p2",
          runNumber: 2,
          fromContact: "W/CBL",
          toContact: "100",
          wirePartNumber: "CBL-1",
          length: 60,
          labelPartNumber: "LBL-1",
          notes: ""
        },
        {
          ...snapshot.paths[0],
          id: "p3",
          runNumber: 3,
          fromContact: "100",
          toContact: "100",
          wirePartNumber: "7-100",
          length: 36,
          labelPartNumber: "",
          notes: ""
        }
      ]
    });
    const buffer = await buildWirelistXlsxBuffer(rows);
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toEqual(["Wirelist", "BOM", "Columns Counted"]);
    const sheet = workbook.Sheets["Columns Counted"];
    const grid = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1, defval: null });
    const cell = (ref: string) => sheet[ref]?.v ?? null;

    expect(cell("A1")).toBe("Columns Counted: 3 wirelist row(s), 1 W/CBL end(s).");
    expect(grid[4].slice(1)).toEqual([
      "Non-BOM Items", "Qty", null,
      "BOM Contacts", "Qty", null,
      "Patchcords", "Qty", null,
      "Wire", "Qty", "Total BOM Qty", "Unit",
      "Labels", "Qty", null,
      "Items", "Qty", null,
      "Warnings"
    ]);
    expect([cell("B6"), cell("C6")]).toEqual(["(100)", 1]);
    expect([cell("E6"), cell("F6")]).toEqual(["100", 4]);
    expect([cell("H6"), cell("I6")]).toEqual(["7-100", 1]);
    expect([cell("K6"), cell("L6"), cell("M6"), cell("N6")]).toEqual(['CBL-1 @60"', 1, 1, "ea"]);
    expect([cell("K7"), cell("L7"), cell("M7"), cell("N7")]).toEqual(['WIRE-1 @24"', 1, 2, "ft"]);
    expect([cell("O6"), cell("P6")]).toEqual(["LBL-1", 2]);
    expect([cell("R6"), cell("S6")]).toEqual(["555555", 2]);
    expect(cell("U6")).toBeNull();
  });

  it("can omit the Columns Counted sheet", async () => {
    const buffer = await buildWirelistXlsxBuffer(snapshotToWirelistRows(snapshot), { includeColumnsCounted: false });
    expect(XLSX.read(buffer, { type: "buffer" }).SheetNames).toEqual(["Wirelist", "BOM"]);
  });

  it("renders empty cells as dashes and shrinks the print area for short wirelists", async () => {
    const buffer = await buildWirelistXlsxFromTemplateRows([
      [1, "J1", "", "SRC", "", "PN-1", "", "white", "", "J2", "", "", "", "", ""]
    ]);
    const zip = new AdmZip(buffer);
    const row2 = zip.readAsText("xl/worksheets/sheet1.xml").match(/<row r="2"[^>]*>[\s\S]*?<\/row>/)?.[0] ?? "";

    expect(readCellValue(zip, "C2")).toBe("-");
    expect(readCellValue(zip, "G2")).toBe("-");
    expect(readCellValue(zip, "H2")).toBe("white");
    expect(readCellValue(zip, "N2")).toBe("-");
    expect(row2).not.toContain('"/ t="inlineStr"');
    expect(row2).toContain('<c r="B2" s="5" t="inlineStr">');
    expect(zip.readAsText("xl/worksheets/sheet1.xml")).toContain('<dimension ref="A1:O2"/>');
    expect(zip.readAsText("xl/workbook.xml")).toContain("Wirelist!$A$1:$O$2");
  });
});
