import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import { extractVpcWorkbook } from "./extract.js";

async function withWorkbook(names: string[], check: (file: string) => void): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "vpc-workbook-"));
  try {
    const workbook = XLSX.utils.book_new();
    for (const name of names) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ part_number: name }]), name);
    }
    const file = path.join(directory, "catalog.xlsx");
    XLSX.writeFile(workbook, file);
    check(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("extracts copied PARTS and COMPATIBILITY sheets", async () => {
  await withWorkbook(["Copy of PARTS", "Copy of COMPATIBILITY"], file => {
    const sheets = extractVpcWorkbook(file);
    assert.equal(sheets.parts[0].cells.part_number, "Copy of PARTS");
    assert.equal(sheets.compatibility[0].cells.part_number, "Copy of COMPATIBILITY");
  });
});

test("prefers canonical sheets and rejects ambiguous copies", async () => {
  await withWorkbook(["PARTS", "Copy of PARTS", "COMPATIBILITY"], file => {
    assert.equal(extractVpcWorkbook(file).parts[0].cells.part_number, "PARTS");
  });
  await withWorkbook(["Copy of PARTS", "copy of parts ", "COMPATIBILITY"], file => {
    assert.throws(() => extractVpcWorkbook(file), /multiple copies of the PARTS sheet/);
  });
});
