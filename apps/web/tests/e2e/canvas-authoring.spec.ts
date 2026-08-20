import { expect, test } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  ingestReviewedLibraryItems,
  openDetailsWithRetry,
  putPartRelationship,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("canvas authoring supports create, connect, and delete", async ({ page }) => {
  test.setTimeout(120_000);
  const token = uniqueToken();
  const projectName = `Canvas Auth Project ${token}`;
  const harnessName = `Canvas Auth Harness ${token}`;

  await registerAndSignIn(page, {
    username: `cauth-${token}`,
    email: `cauth-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  await page.getByRole("button", { name: "Add connector" }).click();
  await page.getByRole("button", { name: "Add connector" }).click();
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(2);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 15_000 });

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

  await page.locator("svg line").click({ force: true });
  await expect(page.getByLabel("Wire part number")).toHaveCount(0);
  await expect(page.getByLabel("Length (inches)")).toBeVisible();
  await expect(page.getByLabel("Sleeving")).toBeVisible();

  await connectors.nth(1).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(connectors).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Add junction" }).click();
  await expect(page.getByLabel("Junction label")).toBeVisible();
  await expect(page.getByLabel("Junction type")).toHaveCount(0);
});

test("canvas-first flow reaches details workspace", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Canvas Flow Project ${token}`;
  const harnessName = `Canvas Flow Harness ${token}`;

  await registerAndSignIn(page, {
    username: `cflow-${token}`,
    email: `cflow-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  await openDetailsWithRetry(page);
  await expect(page.getByRole("link", { name: "Back to canvas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await page.getByRole("link", { name: "Back to canvas" }).click();
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();
  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page).toHaveURL(/\/details\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

test("define connector can place an ITA frame with per-slot modules", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = uniqueToken();
  const frameId = `e2e-frame-${token}`;
  const moduleAId = `e2e-mod-a-${token}`;
  const moduleBId = `e2e-mod-b-${token}`;
  const otherId = `e2e-mod-other-${token}`;
  const framePn = `ITA-${token}`;
  const moduleAPn = `MODA-${token}`;
  const moduleBPn = `MODB-${token}`;
  const otherPn = `OTHER-${token}`;

  await ingestReviewedLibraryItems(request, [
    {
      id: frameId,
      category: "frame",
      family: "iCon",
      partNumber: framePn,
      description: "Two-slot ITA",
      isActive: true,
      stockStatus: "in_stock",
      isReviewed: false,
      partType: "ITA",
      attributes: { moduleCapacity: 2, slotIds: ["A", "B"] }
    },
    {
      id: moduleAId,
      category: "module",
      family: "iCon",
      partNumber: moduleAPn,
      description: "Slot A module",
      isActive: true,
      stockStatus: "in_stock",
      isReviewed: false,
      partType: "MODULE",
      attributes: { pinCount: 2, pinIds: ["1", "2"] }
    },
    {
      id: moduleBId,
      category: "module",
      family: "iCon",
      partNumber: moduleBPn,
      description: "Slot B module",
      isActive: true,
      stockStatus: "in_stock",
      isReviewed: false,
      partType: "MODULE",
      attributes: { pinCount: 2, pinIds: ["1", "2"] }
    },
    {
      id: otherId,
      category: "module",
      family: "iCon",
      partNumber: otherPn,
      description: "Incompatible module",
      isActive: true,
      stockStatus: "in_stock",
      isReviewed: false,
      partType: "MODULE",
      attributes: { pinCount: 1, pinIds: ["1"] }
    }
  ]);
  await putPartRelationship(request, {
    parentPartId: frameId,
    compatibleParts: [moduleAPn],
    relationshipType: "MODULE_ALLOWED",
    positionType: "MODULE_SLOT",
    parentPositions: ["A"],
    status: "allowed"
  });
  await putPartRelationship(request, {
    parentPartId: frameId,
    compatibleParts: [moduleBPn],
    relationshipType: "MODULE_ALLOWED",
    positionType: "MODULE_SLOT",
    parentPositions: ["B"],
    status: "allowed"
  });

  await registerAndSignIn(page, {
    username: `cframe-${token}`,
    email: `cframe-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, `Frame Canvas Project ${token}`);
  await createHarnessOnProjectPage(page, `Frame Canvas Harness ${token}`);

  await page.getByRole("button", { name: "Add connector" }).click();
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(1);
  await connectors.nth(0).click();
  await page.getByRole("button", { name: "Define Connector" }).click();
  await expect(page.getByRole("dialog", { name: "Define Connector" })).toBeVisible();
  await page.getByPlaceholder("Search connectors...").fill(framePn);
  await page.getByRole("row").filter({ hasText: framePn }).getByRole("button", { name: "Select" }).click();
  await expect(page.getByRole("button", { name: "Change connector" })).toContainText(`Part number: ${framePn}`);
  await expect(connectors).toHaveCount(1);
  await expect(page.getByLabel("Slot A module name")).toHaveValue("J1A");
  await expect(page.getByLabel("Slot B module name")).toHaveValue("J1B");

  await page.getByRole("button", { name: "Define slot A module" }).click();
  await expect(page.getByRole("dialog", { name: "Select slot A module" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: moduleAPn })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: otherPn })).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: moduleAPn }).getByRole("button", { name: "Select" }).click();
  await expect(page.getByRole("button", { name: "Change slot A module" })).toContainText(`Part number: ${moduleAPn}`);

  await page.getByRole("button", { name: "Define slot B module" }).click();
  await page.getByRole("row").filter({ hasText: moduleBPn }).getByRole("button", { name: "Select" }).click();
  await expect(page.getByRole("button", { name: "Change slot B module" })).toContainText(`Part number: ${moduleBPn}`);

  await openDetailsWithRetry(page);
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await expect(page.getByText(/J1A/)).toBeVisible();
  await expect(page.getByText(/J1B/)).toBeVisible();
});
