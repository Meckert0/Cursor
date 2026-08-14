import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import XLSX from "xlsx";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("wirelist route is reachable from canvas", async ({ page }) => {
  test.setTimeout(120_000);
  const token = uniqueToken();
  const projectName = `Wirelist Project ${token}`;
  const harnessName = `Wirelist Harness ${token}`;

  await registerAndSignIn(page, {
    username: `wirelist-${token}`,
    email: `wirelist-${token}@example.com`
  });

  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)\/canvas$/i.exec(page.url());
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";
  await page.goto(`/harnesses/${harnessId}/wirelist`);
  await expect(page.getByRole("heading", { name: "Wirelist" })).toBeVisible();

  await page.getByRole("link", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

test("wirelist template import and xlsx export round-trip", async ({ page }) => {
  test.setTimeout(120_000);
  const token = uniqueToken();
  const projectName = `Wirelist Roundtrip Project ${token}`;
  const harnessName = `Wirelist Roundtrip Harness ${token}`;

  await registerAndSignIn(page, {
    username: `wlrt-${token}`,
    email: `wlrt-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  await page.getByRole("button", { name: "Add connector" }).click();
  await page.getByRole("button", { name: "Add connector" }).click();
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(2);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 15_000 });

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)\/canvas$/i.exec(page.url());
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";
  await page.goto(`/harnesses/${harnessId}/wirelist`);
  await expect(page.getByRole("heading", { name: "Wirelist" })).toBeVisible();

  const workbook = XLSX.utils.book_new();
  const rows = [
    [
      "Run #",
      "From Location (Conn - Pin)",
      "From Contact",
      "From Signal Desc",
      "Wire AWG",
      "Wire/Patchcord P/N",
      "Length (in)",
      "Wire Color",
      "Wire Group",
      "To Location (Conn-Pin)",
      "To Contact",
      "To Signal Desc",
      "Label P/N",
      "Label Text",
      "Notes"
    ],
    [1, "J1", "1", "SRC", "22", "PN-ROUNDTRIP", "6.5", "white", "G1", "J2", "1", "DST", "LBL-1", "W1", "Roundtrip"]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Wirelist");
  const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const importFilePath = test.info().outputPath(`wirelist-import-${token}.xlsx`);
  await writeFile(importFilePath, fileBuffer);

  await page.getByTestId("wirelist-import-input").setInputFiles(importFilePath);
  await expect(page.getByText("Wirelist imported and saved.")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download file" }).click();
  const download = await downloadPromise;
  const exportFilePath = test.info().outputPath(`wirelist-export-${token}.xlsx`);
  await download.saveAs(exportFilePath);
  const exportedWorkbook = XLSX.readFile(exportFilePath);
  const wirelistSheet = exportedWorkbook.Sheets.Wirelist;
  expect(wirelistSheet).toBeTruthy();
  const exportedRows = XLSX.utils.sheet_to_json<Array<string | number>>(wirelistSheet, {
    header: 1,
    blankrows: false
  });
  expect(exportedRows[0]).toEqual(rows[0]);
  expect(exportedRows[1]?.[1]).toBe("J1");
  expect(exportedRows[1]?.[2]).toBe("1");
  expect(exportedRows[1]?.[5]).toBe("PN-ROUNDTRIP");
  expect(exportedRows[1]?.[7]).toBe("white");
  expect(exportedRows[1]?.[14]).toBe("Roundtrip");
});
