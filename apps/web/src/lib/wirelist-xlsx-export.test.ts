/** @vitest-environment node */
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { buildWirelistXlsxFromTemplateRows } from "../../../../src/domain/wirelist-xlsx-export";
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
  } as const;

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
    expect(readCellValue(zip, "O2")).toBe("Roundtrip");

    const headerValues = WIRELIST_TEMPLATE_HEADERS.map((_, index) => readCellValue(zip, `${String.fromCharCode(65 + index)}1`));
    expect(headerValues).toEqual([...WIRELIST_TEMPLATE_HEADERS]);
    expect(sheetXml).toContain('<dimension ref="A1:O2"/>');
    expect(zip.readAsText("xl/workbook.xml")).toContain("Wirelist!$A$1:$O$2");
  });

  it("renders empty cells as dashes and shrinks the print area for short wirelists", async () => {
    const buffer = await buildWirelistXlsxFromTemplateRows([
      [1, "J1", "", "SRC", "", "PN-1", "", "white", "", "J2", "", "", "", "", ""]
    ]);
    const zip = new AdmZip(buffer);
    const row2 = zip.readAsText("xl/worksheets/sheet1.xml").match(/<row r="2"[^>]*>[\s\S]*?<\/row>/)?.[0] ?? "";

    expect(readCellValue(zip, "C2")).toBe("-");
    expect(readCellValue(zip, "G2")).toBe("-");
    expect(readCellValue(zip, "M2")).toBe("-");
    expect(row2).not.toContain('"/ t="inlineStr"');
    expect(row2).toContain('<c r="B2" s="5" t="inlineStr">');
    expect(zip.readAsText("xl/worksheets/sheet1.xml")).toContain('<dimension ref="A1:O2"/>');
    expect(zip.readAsText("xl/workbook.xml")).toContain("Wirelist!$A$1:$O$2");
  });
});
