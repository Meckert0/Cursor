import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import XLSX from "xlsx";

async function expectHeadingWithRetry(page: Page, headingName: string, timeoutMs = 20_000) {
  const heading = page.getByRole("heading", { name: headingName });
  try {
    await expect(heading).toBeVisible({ timeout: 5_000 });
    return;
  } catch {
    const notFoundHeading = page.getByRole("heading", { name: "404" });
    if (await notFoundHeading.isVisible().catch(() => false)) {
      await page.reload();
    }
    await expect(heading).toBeVisible({ timeout: timeoutMs });
  }
}

async function openDetailsWithRetry(page: Page) {
  const harnessMatch = /\/harnesses\/([0-9a-f-]+)/i.exec(page.url());
  const harnessCanvasPath = harnessMatch ? `/harnesses/${harnessMatch[1]}/canvas` : "/";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.getByRole("link", { name: "Details" }).click();
      await expectHeadingWithRetry(page, "Details", 15_000);
      return;
    } catch {
      await page.goto(harnessCanvasPath);
      await expectHeadingWithRetry(page, "Graphical authoring (canvas MVP)");
    }
  }

  throw new Error("Could not open details after retries.");
}

test("home page renders and links to library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cable Design Tool Frontend (MVP)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse library catalog" })).toBeVisible();
});

test("admin overview route redirects non-admin users", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Cable Design Tool Frontend (MVP)" })).toBeVisible();
});

async function createProjectAndOpenProjectPage(page: Page, projectName: string) {
  await page.goto("/");
  await page.getByText("Create project", { exact: true }).click();
  const createProjectForm = page.getByTestId("create-project-form");
  await createProjectForm.getByLabel("Name").fill(projectName);
  await page.getByTestId("create-project-submit").click();
  const projectLink = page.getByRole("link", { name: projectName });
  await expect(projectLink).toBeVisible();
  await projectLink.click();
  await expectHeadingWithRetry(page, "Project workspace");
}

test("critical path: create -> details -> validate -> export", async ({ page }) => {
  const token = Date.now();
  const projectName = `E2E Project ${token}`;
  const harnessName = `E2E Harness ${token}`;

  await createProjectAndOpenProjectPage(page, projectName);

  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();

  await openDetailsWithRetry(page);
  await page.getByRole("link", { name: "Back to canvas" }).click();
  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page).toHaveURL(/\/details\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByTestId("details-bom-section")).toBeVisible();
  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);
  await expect(page.getByText("Summary:", { exact: false })).toBeVisible();

  await page.getByTestId("create-json-export-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await expect(page.getByTestId("details-export-list")).toContainText("json", { timeout: 30_000 });
  await expect(page.getByTestId("details-export-list")).toContainText("completed", { timeout: 30_000 });
});

test("harness root route redirects to canvas and keeps details access", async ({ page }) => {
  const token = Date.now();
  const projectName = `Blocked Project ${token}`;
  const harnessName = `Blocked Harness ${token}`;

  await createProjectAndOpenProjectPage(page, projectName);
  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();

  await page.goto(page.url().replace(/\/canvas$/, ""));
  await expect(page).toHaveURL(/\/harnesses\/[0-9a-f-]+\/canvas$/);
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();

  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

test("legacy revision routes redirect to details routes", async ({ page }) => {
  const token = Date.now();
  const projectName = `Redirect Project ${token}`;
  const harnessName = `Redirect Harness ${token}`;

  await createProjectAndOpenProjectPage(page, projectName);
  await page.getByText("Create harness", { exact: true }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)\/canvas$/i.exec(page.url());
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";
  await page.goto(`/harnesses/${harnessId}/revisions/new`);
  await expect(page).toHaveURL(new RegExp(`/harnesses/${harnessId}/details/new$`));
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

  await page.getByRole("link", { name: "Back to canvas" }).click();
  const detailsHref = await page.getByRole("link", { name: "Open Revision Workspace" }).getAttribute("href");
  expect(detailsHref).toBeTruthy();
  const detailIdMatch = /\/details\/([0-9a-f-]+)$/i.exec(detailsHref ?? "");
  expect(detailIdMatch).toBeTruthy();
  const detailId = detailIdMatch?.[1] ?? "";
  await page.goto(`/revisions/${detailId}`);
  await expect(page).toHaveURL(new RegExp(`/details/${detailId}$`));
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

test("admin moderation flow: queue filter and bulk approve", async ({ page, request }) => {
  const token = Date.now();
  const partNumberApproved = `M22759/16-${(token % 80) + 10}`;
  const partNumberArchived = `MDM-${(token % 90) + 10}P`;

  const ingestOne = await request.post("http://127.0.0.1:3000/v1/library/components/ingest", {
    headers: {
      "content-type": "application/json",
      "x-role": "editor",
      "x-user-id": `author-${token}`
    },
    data: {
      items: [
        {
          id: `cmp-e2e-admin-${token}-1`,
          category: "wire",
          family: "MIL-W-22759",
          partNumber: partNumberApproved,
          description: "E2E moderation queue item A",
          awg: "20",
          color: "white",
          isActive: true,
          stockStatus: "in_stock",
          compatibilityHints: [],
          isReviewed: false
        }
      ]
    }
  });
  expect(ingestOne.ok()).toBeTruthy();

  const ingestTwo = await request.post("http://127.0.0.1:3000/v1/library/components/ingest", {
    headers: {
      "content-type": "application/json",
      "x-role": "editor",
      "x-user-id": `author-${token + 1}`
    },
    data: {
      items: [
        {
          id: `cmp-e2e-admin-${token}-2`,
          category: "contact",
          family: "Micro-D",
          partNumber: partNumberArchived,
          description: "E2E moderation queue item B",
          isActive: true,
          stockStatus: "low_stock",
          compatibilityHints: [],
          isReviewed: false
        }
      ]
    }
  });
  expect(ingestTwo.ok()).toBeTruthy();

  await page.goto("/admin/datastores");
  await expect(page.getByRole("heading", { name: "Datastore Admin Console (Phase 7)" })).toBeVisible();
  await expect(page.getByText(partNumberApproved)).toBeVisible();
  await expect(page.getByText(partNumberArchived)).toBeVisible();

  await page.getByLabel("Entered by user").fill(`author-${token}`);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(partNumberApproved)).toBeVisible();
  await expect(page.getByText(partNumberArchived)).not.toBeVisible();

  await page.locator(`input[name="selectedComponentId"][value="cmp-e2e-admin-${token}-1"]`).check();
  await page.getByRole("button", { name: "Bulk approve selected" }).click();
  await expect(page).toHaveURL(/notice=/);
  await page.getByLabel("Entered by user").fill(`author-${token}`);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No pending entries for current filters.")).toBeVisible();
});

test("dashboard supports project rename and delete", async ({ page }) => {
  const token = Date.now();
  const initialName = `Rename Me ${token}`;
  const renamedName = `Renamed ${token}`;

  await page.goto("/");
  await page.getByText("Create project", { exact: true }).click();
  const createProjectForm = page.getByTestId("create-project-form");
  await createProjectForm.getByLabel("Name").fill(initialName);
  await page.getByTestId("create-project-submit").click();
  await expect(page.getByRole("link", { name: initialName })).toBeVisible();

  const row = page.locator("li", { has: page.getByRole("link", { name: initialName }) });
  await row.getByText("Rename", { exact: true }).click();
  await row.getByLabel(`Rename ${initialName}`).fill(renamedName);
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: renamedName })).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  const renamedRow = page.locator("li", { has: page.getByRole("link", { name: renamedName }) });
  await renamedRow.getByTestId(/delete-project-/).click();
  await expect(page.getByRole("link", { name: renamedName })).not.toBeVisible();
});

test("canvas quick-add wire creates unreviewed moderation entry", async ({ page }) => {
  const token = Date.now();
  const projectName = `Canvas Wire Project ${token}`;
  const harnessName = `Canvas Wire Harness ${token}`;
  const quickAddPartNumber = `M22759/16-${(token % 70) + 20}-Q`;

  await createProjectAndOpenProjectPage(page, projectName);
  await page.getByText("Create harness", { exact: true }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();

  await page.getByRole("button", { name: "Add new wire" }).click();
  await page.getByPlaceholder("new wire part number").fill(quickAddPartNumber);
  await page.getByPlaceholder("AWG").fill("22");
  await page.getByPlaceholder("color").fill("white");
  await page.getByRole("button", { name: "Add wire" }).click();
  await expect(page.getByText("Wire added as unreviewed entry.")).toBeVisible();

  const selectedOptionText = await page
    .getByLabel("Wire part number")
    .evaluate((element) => (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? "");
  expect(selectedOptionText).toContain(quickAddPartNumber);

  await page.goto("/admin/datastores");
  await page.getByLabel("Category").selectOption("wire");
  await page.getByLabel("Family").fill("User entered wire");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(quickAddPartNumber, { exact: true })).toBeVisible();
});

test("canvas-first flow supports validation and export", async ({ page }) => {
  const token = Date.now();
  const projectName = `Canvas Flow Project ${token}`;
  const harnessName = `Canvas Flow Harness ${token}`;

  await createProjectAndOpenProjectPage(page, projectName);
  await page.getByText("Create harness", { exact: true }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();

  await openDetailsWithRetry(page);
  await expect(page.getByRole("link", { name: "Back to canvas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unique wire sections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Endpoint totals" })).toBeVisible();
  await page.getByRole("link", { name: "Back to canvas" }).click();
  await expect(page.getByRole("heading", { name: "Graphical authoring (canvas MVP)" })).toBeVisible();
  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page).toHaveURL(/\/details\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByTestId("details-bom-section")).toBeVisible();
  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);
  await expect(page.getByText("Summary:", { exact: false })).toBeVisible();

  await page.getByTestId("create-json-export-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await expect(page.getByTestId("details-export-list")).toContainText("json", { timeout: 30_000 });
  await expect(page.getByTestId("details-export-list")).toContainText("completed", { timeout: 30_000 });
});

test("wirelist route is reachable from canvas", async ({ page }) => {
  test.setTimeout(120_000);
  const token = Date.now();
  const projectName = `Wirelist Project ${token}`;
  const harnessName = `Wirelist Harness ${token}`;
  const email = `wirelist-${token}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Username").fill(`wirelist-${token}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("pass1234!");
  await page.getByLabel("Confirm password", { exact: true }).fill("pass1234!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await createProjectAndOpenProjectPage(page, projectName);
  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();

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
  const token = Date.now();
  const projectName = `Wirelist Roundtrip Project ${token}`;
  const harnessName = `Wirelist Roundtrip Harness ${token}`;

  await createProjectAndOpenProjectPage(page, projectName);
  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();

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
    [1, "J1 - 1", "1", "SRC", "22", "PN-ROUNDTRIP", "6.5", "white", "G1", "J2 - 1", "1", "DST", "LBL-1", "W1", "Roundtrip"]
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
  const exportedRows = XLSX.utils.sheet_to_json<Array<string | number>>(wirelistSheet, { header: 1, blankrows: false });
  expect(exportedRows[0]).toEqual(rows[0]);
  expect(exportedRows[1]?.[1]).toBe("J1");
  expect(exportedRows[1]?.[2]).toBe("1");
  expect(exportedRows[1]?.[5]).toBe("PN-ROUNDTRIP");
  expect(exportedRows[1]?.[14]).toBe("Roundtrip");
});
