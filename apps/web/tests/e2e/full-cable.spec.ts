import { expect, type Page, test } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  registerAndSignIn,
  uniqueToken
} from "./helpers";
import { FULL_CABLE, FULL_CABLE_BOM_EXPECTATIONS } from "./fixtures/full-cable";

async function waitForCanvasSaved(page: Page) {
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, {
    timeout: 20_000
  });
}

async function connectFirstTwoConnectors(page: Page) {
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(2);
  const firstHandle = connectors.nth(0).locator('[class*="connectHandle"]');
  const handleBox = await firstHandle.boundingBox();
  const targetBox = await connectors.nth(1).boundingBox();
  expect(handleBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("svg line")).toHaveCount(1, { timeout: 10_000 });
}

async function defineConnectorModule(page: Page, partNumber: string) {
  await page.getByRole("button", { name: "Define Connector" }).click();
  await expect(page.getByRole("dialog", { name: "Define Connector" })).toBeVisible();
  await page.getByPlaceholder("Search connectors...").fill(partNumber);
  const row = page.getByRole("row").filter({ hasText: partNumber });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Select" }).click();
  await expect(page.getByText(`Part number: ${partNumber}`)).toBeVisible();
}

async function authorFullCableOnCanvas(page: Page) {
  await page.getByRole("button", { name: "Add connector" }).click();
  await page.getByRole("button", { name: "Add connector" }).click();
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(2);

  await connectors.nth(0).click();
  await defineConnectorModule(page, FULL_CABLE.modulePartNumber);
  await page.getByLabel("Backshell").selectOption(FULL_CABLE.backshellLibraryId);
  await page.getByLabel("Strain relief").selectOption(FULL_CABLE.strainReliefLibraryId);
  await waitForCanvasSaved(page);

  await connectors.nth(1).click();
  await defineConnectorModule(page, FULL_CABLE.modulePartNumber);
  await page.getByLabel("Backshell").selectOption(FULL_CABLE.backshellLibraryId);
  await page.getByLabel("Strain relief").selectOption(FULL_CABLE.strainReliefLibraryId);
  await waitForCanvasSaved(page);

  await connectFirstTwoConnectors(page);
  await page.locator("svg line").click({ force: true });
  await expect(page.getByLabel("Wire part number")).toBeVisible();
  await page.getByLabel("Wire part number").selectOption(FULL_CABLE.wireLibraryId);
  await page.getByLabel("Length (inches)").fill(String(FULL_CABLE.wireLengthIn));
  await page.getByLabel("Sleeving").selectOption({ label: FULL_CABLE.sleevingLabel });
  await waitForCanvasSaved(page);
}

async function completeWirelistDetail(page: Page, harnessId: string) {
  await page.goto(`/harnesses/${harnessId}/wirelist`);
  await expect(page.getByRole("heading", { name: "Wirelist" })).toBeVisible();

  const fromLocation = page.locator('input[data-cell-key="fromLocation"]').first();
  await expect(fromLocation).toBeVisible({ timeout: 15_000 });
  await fromLocation.fill(FULL_CABLE.fromLocation);
  await page.locator('input[data-cell-key="fromContact"]').first().fill(FULL_CABLE.contactPartNumber);
  await page.locator('input[data-cell-key="fromSignalDescription"]').first().fill(FULL_CABLE.fromSignal);
  await page.locator('input[data-cell-key="toLocation"]').first().fill(FULL_CABLE.toLocation);
  await page.locator('input[data-cell-key="toContact"]').first().fill(FULL_CABLE.contactPartNumber);
  await page.locator('input[data-cell-key="toSignalDescription"]').first().fill(FULL_CABLE.toSignal);
  await page.locator('input[data-cell-key="labelPartNumber"]').first().fill(FULL_CABLE.labelPartNumber);
  await page.locator('input[data-cell-key="labelText"]').first().fill(FULL_CABLE.labelText);
  await page.locator('input[data-cell-key="labelText"]').first().blur();

  await expect(page.getByTestId("wirelist-save-status")).toContainText(/Unsaved changes|Saving/, {
    timeout: 5_000
  });
  await expect(page.getByTestId("wirelist-save-status")).toContainText(/Saved at/, {
    timeout: 20_000
  });
}

async function assertResolvedBom(page: Page) {
  await expect(page.getByTestId("details-bom-section")).toContainText(/Resolved \d+\/\d+ lines/);
  await expect(page.getByTestId("bom-line-unresolved")).toHaveCount(0);
  const table = page.getByTestId("details-bom-table");
  for (const expectation of FULL_CABLE_BOM_EXPECTATIONS) {
    const row = table.locator("tr").filter({ hasText: expectation.partNumber }).filter({ hasText: expectation.category });
    await expect(row).toBeVisible();
    await expect(row).toContainText(expectation.quantity);
    await expect(row).toContainText("resolved");
  }
}

async function waitForExportCompleted(page: Page, format: "json" | "pdf" | "xlsx") {
  await expect(page.getByTestId("details-export-list")).toContainText(format, { timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("details-export-list").innerText();
        const lines = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        return lines.some((line) => line.includes(format) && line.includes("completed"));
      },
      { timeout: 60_000 }
    )
    .toBe(true);
}

test("full-cable journey: author, validate, BOM, export, submit", async ({ page }) => {
  test.setTimeout(240_000);
  const token = uniqueToken();
  const projectName = `Full Cable Project ${token}`;
  const harnessName = `Full Cable Harness ${token}`;

  await registerAndSignIn(page, {
    username: `fullcable-${token}`,
    email: `fullcable-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)\/canvas$/i.exec(page.url());
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";

  await authorFullCableOnCanvas(page);
  await completeWirelistDetail(page, harnessId);

  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page).toHaveURL(/\/details\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByTestId("details-bom-section")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);
  await expect(page.getByText(/Summary:\s*errors 0/i)).toBeVisible({ timeout: 20_000 });

  await assertResolvedBom(page);

  await page.getByTestId("create-json-export-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await waitForExportCompleted(page, "json");

  await page.getByRole("button", { name: "Create PDF export" }).click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await waitForExportCompleted(page, "pdf");

  await page.getByRole("button", { name: "Create XLSX export" }).click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await waitForExportCompleted(page, "xlsx");

  await expect(page.getByTestId("export-download-link").first()).toBeVisible();

  await page.getByTestId("submit-for-quote-message").fill("Full cable ready for quote.");
  await page.getByTestId("submit-for-quote-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Quote submission received.");
  await expect(page.getByTestId("details-submissions-list")).toContainText("received");
});
