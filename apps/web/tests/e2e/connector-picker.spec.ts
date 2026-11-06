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

test("connector and frame creation stay separate through searches, undo, and reload", async ({ page, request }) => {
  const token = uniqueToken();
  const prefix = `SPLIT-${token}`;
  const common = { family: prefix, isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: `${prefix}-MOD`, category: "module", partType: "MODULE", partNumber: `${prefix}-MOD`, description: "Standalone connector", attributes: { pinCount: 24 } },
    { ...common, id: `${prefix}-ITA`, category: "frame", partType: "ITA", side: "ITA", partNumber: `${prefix}-ITA`, description: "ITA housing", attributes: { moduleCapacity: 1, slotIds: ["A"] } },
    { ...common, id: `${prefix}-RCV`, category: "frame", partType: "RECEIVER", side: "RECEIVER", partNumber: `${prefix}-RCV`, description: "Receiver housing", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } },
    { ...common, id: `${prefix}-SIM`, category: "module", partType: "SIM_INSERT", partNumber: `${prefix}-SIM`, description: "SIM insert", attributes: { pinCount: 1 } }
  ]);
  await registerAndSignIn(page, { username: `split-${token}`, email: `split-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `Split project ${token}`);
  await createHarnessOnProjectPage(page, `Split harness ${token}`);
  await page.getByRole("button", { name: "Add connector", exact: true }).click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  const connectorPicker = page.getByRole("dialog", { name: "Define Connector", exact: true });
  await connectorPicker.getByLabel("Search the parts library").fill(prefix);
  await expect(connectorPicker.getByRole("radio")).toHaveCount(1);
  await expect(connectorPicker.getByRole("radio", { name: `Preview ${prefix}-MOD`, exact: true })).toBeVisible();
  await connectorPicker.getByLabel("Search the parts library").fill(`${prefix}-ITA`);
  await expect(connectorPicker.getByRole("radio")).toHaveCount(0);
  await connectorPicker.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(connectorPicker.getByRole("radio")).toHaveCount(0);
  await connectorPicker.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Add frame", exact: true }).click();
  await expect(page.getByLabel("Frame name", { exact: true })).toHaveValue("J2");
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: "Frame J2", exact: true }).click();
  await page.getByRole("button", { name: "Define Frame", exact: true }).click();
  const framePicker = page.getByRole("dialog", { name: "Define Frame", exact: true });
  await framePicker.getByLabel("Search the parts library").fill(prefix);
  await expect(framePicker.getByRole("radio")).toHaveCount(2);
  await expect(framePicker.getByRole("radio", { name: `Preview ${prefix}-MOD`, exact: true })).toHaveCount(0);
  await expect(framePicker.getByRole("button", { name: "Module capacity filter", exact: true })).toBeVisible();
  await framePicker.getByLabel("Search the parts library").fill(`${prefix}-MOD`);
  await expect(framePicker.getByRole("radio")).toHaveCount(0);
  await framePicker.getByLabel("Search the parts library").fill(prefix);
  await selectConnectorPickerPart(page, `${prefix}-RCV`, "frame");
  await expect(page.getByRole("button", { name: "Change frame", exact: true })).toContainText(`${prefix}-RCV`);
  await expect(page.getByRole("button", { name: "Define slot A module", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Define slot B module", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Define Frame", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change frame", exact: true })).toContainText(`${prefix}-RCV`);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: "Frame J2", exact: true }).click();
  await page.getByRole("button", { name: "Change frame", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(prefix);
  await expect(page.getByRole("dialog", { name: "Define Frame", exact: true }).getByRole("radio")).toHaveCount(2);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Connector J1", exact: true }).click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(prefix);
  await expect(page.getByRole("dialog", { name: "Define Connector", exact: true }).getByRole("radio")).toHaveCount(1);
  await selectConnectorPickerPart(page, `${prefix}-MOD`);
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(`${prefix}-MOD`);
});

test("frame quick-add creates a Receiver housing even when a connector has the same part number", async ({ page, request }) => {
  const token = uniqueToken();
  const partNumber = `SAME-PART-${token}`;
  await ingestReviewedLibraryItems(request, [{
    id: `${partNumber}-module`, category: "module", partType: "MODULE", partNumber, family: partNumber, description: "Existing connector",
    isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { pinCount: 24 }
  }]);
  await registerAndSignIn(page, { username: `frame-create-${token}`, email: `frame-create-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `Frame creation project ${token}`);
  await createHarnessOnProjectPage(page, `Frame creation harness ${token}`);
  await page.getByRole("button", { name: "Add frame", exact: true }).click();
  await page.getByRole("button", { name: "Define Frame", exact: true }).click();
  await page.getByRole("button", { name: "+ Add new frame", exact: true }).click();
  const createForm = page.getByRole("dialog", { name: "Add new frame", exact: true });
  await createForm.getByRole("combobox", { name: "Housing type", exact: true }).selectOption("RECEIVER");
  await createForm.getByLabel("Part number", { exact: true }).fill(partNumber);
  await createForm.getByLabel("Family", { exact: true }).fill(partNumber);
  await createForm.getByLabel("Description", { exact: true }).fill("New Receiver housing");
  await createForm.getByLabel("Module capacity", { exact: true }).fill("2");
  await createForm.getByLabel("Slot IDs", { exact: true }).fill("A,B");
  await createForm.getByRole("button", { name: "Add frame", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Define Frame", exact: true });
  await expect(picker.getByRole("radio", { name: `Preview ${partNumber}`, exact: true })).toBeChecked();
  await expect(picker.getByRole("table", { name: "Parts matching your search" }).locator("tbody tr")).toHaveCount(1);
  await expect(picker.getByRole("table")).toContainText("Receiver housing");
  await expect(picker.getByRole("table")).toContainText("Receiver");
  await selectConnectorPickerPart(page, partNumber, "frame");
  await expect(page.getByRole("button", { name: "Change frame", exact: true })).toContainText(partNumber);
  await expect(page.getByRole("button", { name: "Define slot A module", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Define slot B module", exact: true })).toBeVisible();
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: "Frame J1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change frame", exact: true })).toContainText(partNumber);
  await page.getByRole("button", { name: "Add connector", exact: true }).click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(partNumber);
  const connectorPicker = page.getByRole("dialog", { name: "Define Connector", exact: true });
  await expect(connectorPicker.getByRole("radio")).toHaveCount(1);
  await expect(connectorPicker.getByRole("table")).toContainText("Existing connector");
  await expect(connectorPicker.getByRole("table")).not.toContainText("Receiver housing");
});
