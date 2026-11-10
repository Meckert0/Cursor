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

async function dragPointer(page: Page, source: { x: number; y: number }, target: { x: number; y: number }) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

test("hybrid positions show contact groups in results and previews and filter by total", async ({ page, request }) => {
  const token = uniqueToken(), prefix = `HYBRID-${token}`;
  const common = { category: "module", partType: "MODULE", family: "iCon", side: "ITA", isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: `${prefix}-MIXED`, partNumber: `${prefix}-MIXED`, description: "Signal and power hybrid", attributes: { positionCount: 108, pinCount: 100, pinCount2: 8 } },
    { ...common, id: `${prefix}-GROUPED`, partNumber: `${prefix}-GROUPED`, description: "Hybrid with contact-size groups", attributes: { positionCount: 108, pinCount: 108, contactPositions: [{ contactSize: "20", pinCount: 100 }, { contactSize: "12", pinCount: 8 }] } },
    { ...common, id: `${prefix}-SIGNAL`, partNumber: `${prefix}-SIGNAL`, description: "Signal module", attributes: { positionCount: 96 } }
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dialog = await openPicker(page, token);
  await dialog.getByLabel("Search the parts library").fill(prefix);
  const rows = dialog.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.getByRole("cell", { name: "100/8", exact: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Sort Positions ascending", exact: true }).click();
  await expect(rows.first()).toContainText(`${prefix}-SIGNAL`);
  await dialog.getByRole("button", { name: "Sort Positions descending", exact: true }).click();
  await expect(rows.last()).toContainText(`${prefix}-SIGNAL`);
  await dialog.getByRole("button", { name: "Filter Positions", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Positions options", exact: true });
  await expect(menu).toContainText("Ranges and sorting use the total positions.");
  await menu.getByLabel("Minimum").fill("108");
  await menu.getByLabel("Maximum").fill("108");
  await menu.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await dialog.getByLabel("Search the parts library").fill("100/8");
  await expect(rows.getByRole("cell", { name: "100/8", exact: true })).toHaveCount(2);
  await dialog.getByRole("radio", { name: `Preview ${prefix}-MIXED`, exact: true }).check();
  const preview = dialog.getByRole("region", { name: "Selected part specifications" });
  await expect(preview.locator("dl div").filter({ has: page.getByText("Positions", { exact: true }) }).locator("dd")).toHaveText("100/8");
  await dialog.screenshot({ path: test.info().outputPath("picker-hybrid-positions.png") });
});

test("picker columns resize, reorder, retain their layout, and isolate blank fillers by family", async ({ page, request }) => {
  const token = uniqueToken(), prefix = `LAYOUT-${token}`;
  const common = { category: "module", partType: "MODULE", isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: `${prefix}-BLANK`, partNumber: `${prefix}-BLANK`, family: "ITA/RCV", description: "Blank module", side: "DUAL", attributes: { positionCount: 0 } },
    { ...common, id: `${prefix}-SIGNAL`, partNumber: `${prefix}-SIGNAL`, family: "iCon", description: "Signal module", side: "ITA", attributes: { positionCount: 96 } },
    { ...common, id: `${prefix}-HOST`, partNumber: `${prefix}-HOST`, family: "iCon", description: "SIM module awaiting inserts", side: "RECEIVER", electricalMode: "INSERT_HOST", attributes: { simSlotCount: 16 } }
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let dialog = await openPicker(page, token);
  await dialog.getByLabel("Search the parts library").fill(prefix);
  const options = dialog.getByRole("group", { name: "Filter and column options" });
  for (const label of ["Type", "Positions", "Availability"]) await expect(options.getByRole("button", { name: `${label} filter`, exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Filter Positions", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Filter Availability", exact: true })).toBeVisible();
  await dialog.getByRole("radio", { name: `Preview ${prefix}-SIGNAL`, exact: true }).check();
  const resize = dialog.getByRole("separator", { name: "Resize Description column", exact: true });
  const initialWidth = Number(await resize.getAttribute("aria-valuenow"));
  const edge = (await resize.boundingBox())!;
  await dragPointer(page, { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 }, { x: edge.x + edge.width / 2 + 100, y: edge.y + edge.height / 2 });
  await expect(resize).toHaveAttribute("aria-valuenow", String(initialWidth + 100));
  expect((await dialog.locator('th[data-picker-column="description"]').boundingBox())!.width).toBeCloseTo(initialWidth + 100, 0);

  const grip = (await dialog.getByRole("button", { name: "Move Description column", exact: true }).boundingBox())!;
  const target = (await dialog.locator('th[data-picker-column="partNumber"]').boundingBox())!;
  await dragPointer(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: target.x + 12, y: target.y + target.height / 2 });
  await expect(dialog.locator("th[data-picker-column]").first()).toHaveAttribute("data-picker-column", "description");
  await expect(dialog.getByRole("radio", { name: `Preview ${prefix}-SIGNAL`, exact: true })).toBeChecked();
  const sourcePart = (await dialog.getByRole("button", { name: "Move Part number column", exact: true }).boundingBox())!;
  const familyTarget = (await dialog.locator('th[data-picker-column="family"]').boundingBox())!;
  await dragPointer(page, { x: sourcePart.x + sourcePart.width / 2, y: sourcePart.y + sourcePart.height / 2 }, { x: familyTarget.x + familyTarget.width - 12, y: familyTarget.y + familyTarget.height / 2 });
  const familyBounds = (await dialog.locator('th[data-picker-column="family"]').boundingBox())!;
  const partBounds = (await dialog.locator('th[data-picker-column="partNumber"]').boundingBox())!;
  expect(partBounds.x).toBeCloseTo(familyBounds.x + familyBounds.width, 0);
  await dialog.screenshot({ path: test.info().outputPath("picker-custom-columns.png") });

  await dialog.getByRole("button", { name: "Family filter", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Family options", exact: true });
  await menu.getByRole("checkbox", { name: /^Blank insert\s*1$/ }).check();
  await menu.getByRole("button", { name: "Apply filter", exact: true }).click();
  const rows = dialog.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`${prefix}-BLANK`);
  await expect(rows.first()).toContainText("Blank insert");
  await expect(rows.first()).toContainText("ITA & Receiver");
  await dialog.screenshot({ path: test.info().outputPath("picker-blank-family.png") });
  await dialog.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await dialog.getByRole("button", { name: "Side filter", exact: true }).click();
  let sideMenu = page.getByRole("dialog", { name: "Side options", exact: true });
  await expect(sideMenu.getByRole("checkbox", { name: /Dual|ITA & Receiver/ })).toHaveCount(0);
  await sideMenu.getByRole("checkbox", { name: "ITA 2", exact: true }).check();
  await sideMenu.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(dialog.getByRole("radio", { name: `Preview ${prefix}-BLANK`, exact: true })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: `Preview ${prefix}-SIGNAL`, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Filter Side", exact: true }).click();
  sideMenu = page.getByRole("dialog", { name: "Side options", exact: true });
  await sideMenu.getByRole("checkbox", { name: "ITA 2", exact: true }).uncheck();
  await sideMenu.getByRole("checkbox", { name: "Receiver 2", exact: true }).check();
  await sideMenu.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(dialog.getByRole("radio", { name: `Preview ${prefix}-BLANK`, exact: true })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: `Preview ${prefix}-HOST`, exact: true })).toBeVisible();
  await dialog.screenshot({ path: test.info().outputPath("picker-shared-receiver-side.png") });
  await dialog.getByRole("button", { name: "Side filter", exact: true }).click();
  sideMenu = page.getByRole("dialog", { name: "Side options", exact: true });
  await sideMenu.getByRole("checkbox", { name: "ITA 2", exact: true }).check();
  await sideMenu.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await dialog.getByRole("button", { name: "Reset filters", exact: true }).click();
  await dialog.getByRole("button", { name: "Sort Family ascending", exact: true }).click();
  await expect(rows.first()).toContainText(`${prefix}-BLANK`);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Define Connector", exact: true });
  await expect(dialog.locator("th[data-picker-column]").first()).toHaveAttribute("data-picker-column", "description");
  await expect(dialog.getByRole("separator", { name: "Resize Description column", exact: true })).toHaveAttribute("aria-valuenow", String(initialWidth + 100));
  await page.reload();
  await page.locator('[class*="connectorNode"]').first().click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Define Connector", exact: true });
  await expect(dialog.locator("th[data-picker-column]").first()).toHaveAttribute("data-picker-column", "description");
  await expect(dialog.getByRole("separator", { name: "Resize Description column", exact: true })).toHaveAttribute("aria-valuenow", String(initialWidth + 100));
  await dialog.getByLabel("Search the parts library").fill(prefix);
  await dialog.getByRole("button", { name: /^Columns/ }).click();
  await page.getByRole("button", { name: "Reset columns", exact: true }).click();
  await expect(dialog.locator("th[data-picker-column]").first()).toHaveAttribute("data-picker-column", "partNumber");
  await expect(dialog.getByRole("separator", { name: "Resize Description column", exact: true })).toHaveAttribute("aria-valuenow", String(initialWidth));
  await expect(dialog.getByLabel("Search the parts library")).toHaveValue(prefix);
});

test.describe("touch column controls", () => {
  test.use({ viewport: { width: 390, height: 960 }, hasTouch: true });
  test("resizes and moves columns with touch while preserving the popup", async ({ page, request }) => {
    const token = uniqueToken(), pn = `TOUCH-PICK-${token}`;
    await ingestReviewedLibraryItems(request, [{ id: pn, category: "module", partType: "MODULE", family: "iCon", partNumber: pn, description: "Touch module", side: "ITA", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { positionCount: 96 } }]);
    const dialog = await openPicker(page, token);
    await dialog.getByLabel("Search the parts library").fill(pn);
    const session = await page.context().newCDPSession(page);
    const touchDrag = async (x: number, y: number, toX: number, toY: number) => {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      for (let step = 1; step <= 8; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (toX - x) * step / 8, y: y + (toY - y) * step / 8, id: 1 }] });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    try {
      const handle = dialog.getByRole("separator", { name: "Resize Part number column", exact: true });
      const initial = Number(await handle.getAttribute("aria-valuenow"));
      const edge = (await handle.boundingBox())!;
      await touchDrag(edge.x + edge.width / 2, edge.y + edge.height / 2, edge.x + edge.width / 2 + 40, edge.y + edge.height / 2);
      await expect(handle).toHaveAttribute("aria-valuenow", String(initial + 40));
      const grip = (await dialog.getByRole("button", { name: "Move Description column", exact: true }).boundingBox())!;
      const target = (await dialog.locator('th[data-picker-column="partNumber"]').boundingBox())!;
      await touchDrag(grip.x + grip.width / 2, grip.y + grip.height / 2, target.x + 12, target.y + target.height / 2);
      await expect(dialog.locator("th[data-picker-column]").first()).toHaveAttribute("data-picker-column", "description");
      await expect(dialog).toBeVisible();
      await dialog.screenshot({ path: test.info().outputPath("picker-mobile-columns.png") });
    } finally { await session.detach(); }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Define Connector", exact: true })).toBeFocused();
  });
});

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
