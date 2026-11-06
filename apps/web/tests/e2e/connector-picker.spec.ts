import { expect, test, type Page } from "@playwright/test";
import {
  createHarnessOnProjectPage, createProjectAndOpenProjectPage, ingestReviewedLibraryItems,
  registerAndSignIn, selectConnectorPickerPart, uniqueToken
} from "./helpers";

async function openPicker(page: Page, token: number) {
  await registerAndSignIn(page, { username: `picker-${token}`, email: `picker-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `Picker project ${token}`);
  await createHarnessOnProjectPage(page, `Picker harness ${token}`);
  await page.getByRole("button", { name: "Add connector", exact: true }).click();
  await page.locator('[class*="connectorNode"]').first().click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  return page.getByRole("dialog", { name: "Define Connector", exact: true });
}

test("wide picker synchronizes top/column filters, sorts columns, and preserves selection through autosave and undo", async ({ page, request }) => {
  const token = uniqueToken();
  const prefix = `PICK-${token}`;
  const family = `Picker family ${token}`;
  await ingestReviewedLibraryItems(request, [64, 96, 160].map((count, index) => ({
    id: `${prefix}-${count}`, category: "module", partType: "MODULE", partNumber: `${prefix}-${count}`,
    description: `${index === 0 ? "Alpha" : index === 1 ? "Bravo" : "Charlie"} signal module`,
    family: index < 2 ? family : `${family}-other`, side: "ITA", isActive: true, isReviewed: false,
    stockStatus: "in_stock", attributes: { positionCount: count, pinCount: count, gender: "Socket", emi: true }
  })));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dialog = await openPicker(page, token);
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBeCloseTo(1376, 0);
  await dialog.getByLabel("Search the parts library").fill(prefix);
  const rows = dialog.getByRole("table", { name: "Parts matching your search" }).locator("tbody tr");
  await expect(rows).toHaveCount(3);

  await dialog.getByRole("button", { name: "Family filter", exact: true }).click();
  const familyMenu = page.getByRole("dialog", { name: "Family options", exact: true });
  await familyMenu.getByRole("checkbox", { name: `${family} 2`, exact: true }).check();
  await familyMenu.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await dialog.getByRole("button", { name: "Filter Family", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Family options" }).getByRole("checkbox", { name: `${family} 2`, exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect(rows).toHaveCount(3);

  await dialog.getByRole("button", { name: "Sort Positions ascending", exact: true }).click();
  await expect(rows.first()).toContainText(`${prefix}-64`);
  await dialog.getByRole("button", { name: "Sort Positions descending", exact: true }).click();
  await expect(rows.first()).toContainText(`${prefix}-160`);
  await dialog.getByRole("button", { name: "Filter Description", exact: true }).click();
  const descriptionMenu = page.getByRole("dialog", { name: "Description options" });
  await descriptionMenu.getByLabel("Description", { exact: true }).fill("Alpha");
  await descriptionMenu.getByRole("button", { name: "Apply filter" }).click();
  await expect(rows).toHaveCount(1);
  await dialog.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(dialog.getByLabel("Search the parts library")).toHaveValue(prefix);
  await expect(rows).toHaveCount(3);
  await dialog.screenshot({ path: test.info().outputPath("picker-desktop.png") });

  await dialog.getByRole("radio", { name: `Preview ${prefix}-96`, exact: true }).check();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Define Connector", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(`${prefix}-96`);
  await selectConnectorPickerPart(page, `${prefix}-96`);
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(`${prefix}-96`);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Define Connector", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(`${prefix}-96`);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.reload();
  await page.locator('[class*="connectorNode"]').first().click();
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(`${prefix}-96`);
});

test("mobile picker retains top options, constrains column menus, and restores focus on Escape", async ({ page, request }) => {
  const token = uniqueToken();
  const partNumber = `MOBILE-PICK-${token}`;
  await ingestReviewedLibraryItems(request, [{
    id: partNumber, category: "module", partType: "MODULE", partNumber, family: `Mobile ${token}`, description: "Mobile signal module",
    side: "ITA", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { positionCount: 24, pinCount: 24 }
  }]);
  await page.setViewportSize({ width: 390, height: 960 });
  const dialog = await openPicker(page, token);
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(390);
  expect(bounds?.height).toBe(960);
  await dialog.getByLabel("Search the parts library").fill(partNumber);
  await dialog.screenshot({ path: test.info().outputPath("picker-mobile.png") });
  await dialog.getByRole("button", { name: "Family filter", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Family options", exact: true });
  const menuBounds = await popup.boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(390);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(960);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Family filter", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Define Connector", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  await page.setViewportSize({ width: 780, height: 400 });
  await page.getByRole("button", { name: "Family filter", exact: true }).click();
  const shortMenu = await page.getByRole("dialog", { name: "Family options", exact: true }).boundingBox();
  expect(shortMenu!.y).toBeGreaterThanOrEqual(0);
  expect(shortMenu!.y + shortMenu!.height).toBeLessThanOrEqual(400);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 960 });
  await page.getByLabel("Search the parts library").fill(partNumber);
  await selectConnectorPickerPart(page, partNumber);
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(partNumber);
});
