import { expect, test } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  openDetailsWithRetry,
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
