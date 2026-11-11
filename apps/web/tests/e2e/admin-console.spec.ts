import { expect, test } from "@playwright/test";
import { apiAsPageUser, registerAndSignIn, uniqueToken } from "./helpers";
import { DEFAULT_ADMIN_SECTION_TITLES } from "../../../../src/domain/ui-settings";

test("admin console uses full width, groups database tools and persists section names", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await registerAndSignIn(page, { username: `console-admin-${uniqueToken()}`, email: "meckert@vpc.com" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/admin");
  const database = page.locator("#database");
  const tabs = database.getByRole("tab");
  await expect(page.locator("main > section")).toHaveCount(3);
  await expect(tabs).toHaveCount(3);
  const main = await page.getByRole("main").boundingBox();
  expect(main!.x).toBeLessThanOrEqual(1);
  expect(main!.width).toBeGreaterThanOrEqual(1918);
  const boxes = await Promise.all([0, 1, 2].map(index => tabs.nth(index).boundingBox()));
  expect(boxes[0]!.y).toBe(boxes[1]!.y);
  expect(boxes[1]!.y).toBe(boxes[2]!.y);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
  expect(Math.abs(boxes[0]!.width - boxes[2]!.width)).toBeLessThanOrEqual(1);
  await expect(database.getByRole("tabpanel", { name: "Item Database Viewer", exact: true })).toBeVisible();
  const items = database.getByRole("tabpanel", { name: "Item Database Viewer", exact: true });
  const wires = items.getByRole("group", { name: "Wire items", exact: true });
  const coverings = items.getByRole("group", { name: "Sleeve/Tube/Braid items", exact: true });
  await expect(wires).not.toHaveAttribute("open");
  await expect(coverings).not.toHaveAttribute("open");
  await wires.locator(":scope > summary").click();
  await expect(wires.getByRole("table")).toBeVisible();
  await coverings.locator(":scope > summary").click();
  await expect(coverings.getByRole("table")).toBeVisible();
  await wires.locator(":scope > summary").click();
  await expect(wires.getByRole("table")).not.toBeVisible();
  await expect(coverings.getByRole("table")).toBeVisible();
  await coverings.locator(":scope > summary").click();
  await tabs.nth(2).click();
  await database.locator("summary", { hasText: "Add image or file" }).click();
  await expect(database.getByLabel("Hosted file URL", { exact: true })).toBeVisible();
  await database.getByLabel("Caption", { exact: true }).fill("Keep this draft while changing tabs");
  await tabs.nth(2).press("Home");
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(0).press("End");
  await expect(database.getByLabel("Caption", { exact: true })).toHaveValue("Keep this draft while changing tabs");
  await tabs.nth(2).press("ArrowLeft");
  await expect(database.getByRole("tabpanel", { name: "Compatibility & Aliases", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/databaseTab=compatibility/);

  const renamed = {
    pageDescriptions: "Page copy",
    userAccess: "Accounts and projects",
    database: "Parts catalog",
    items: "Inventory",
    compatibility: "Fit rules",
    media: "Drawings and images"
  };
  try {
    await expect(page.getByText("Edit section names", { exact: true })).toHaveCount(0);
    const userName = page.locator('[data-section-name="userAccess"]');
    const userSummary = userName.locator("..");
    await userName.click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Section name actions" })).toBeVisible();
    await expect(userSummary.locator("..")).not.toHaveAttribute("open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(userSummary).toBeFocused();
    await userSummary.press("Shift+F10");
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename section", exact: true });
    await expect(dialog.getByRole("textbox", { name: "Section name", exact: true })).toBeFocused();
    await dialog.getByRole("textbox", { name: "Section name", exact: true }).fill("Unsaved name");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(userName).toHaveText(DEFAULT_ADMIN_SECTION_TITLES.userAccess);
    await userName.click({ button: "right" });
    await page.getByRole("heading", { name: "Admin console", exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);

    for (const [key, value] of Object.entries(renamed)) {
      const name = page.locator(`[data-section-name="${key}"]`);
      await name.click({ button: "right" });
      await expect(page.locator("#database-tab-compatibility")).toHaveAttribute("aria-selected", "true");
      await expect(database.locator(":scope > details")).toHaveAttribute("open", "");
      if (key === "pageDescriptions") {
        await page.screenshot({ path: testInfo.outputPath("section-rename-menu.png"), caret: "initial" });
      }
      await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
      if (key === "pageDescriptions") {
        await page.screenshot({ path: testInfo.outputPath("section-rename-dialog.png"), caret: "initial" });
        await dialog.getByRole("textbox", { name: "Section name", exact: true }).fill("   ");
        await dialog.getByRole("button", { name: "Save name", exact: true }).click();
        await expect(dialog.getByRole("alert")).toContainText("1 and 80 characters");
      }
      await dialog.getByRole("textbox", { name: "Section name", exact: true }).fill(value);
      await dialog.getByRole("button", { name: "Save name", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(name).toHaveText(value);
    }
    await expect(database.locator(":scope > details > summary")).toContainText(renamed.database);
    await page.reload();
    await expect(page.locator("main > section > details > summary").nth(0)).toContainText(renamed.pageDescriptions);
    await expect(page.locator("main > section > details > summary").nth(1)).toContainText(renamed.userAccess);
    await expect(database.getByRole("tab", { name: renamed.compatibility, exact: true })).toHaveAttribute("aria-selected", "true");
    for (const name of [renamed.items, renamed.compatibility, renamed.media]) await expect(database.getByRole("tab", { name, exact: true })).toBeVisible();
    const response = await apiAsPageUser(page, "/v1/ui/page-descriptions");
    expect((await response.json()).adminSectionTitles).toEqual(renamed);
    await page.screenshot({ path: testInfo.outputPath("admin-console-desktop.png"), fullPage: true, caret: "initial" });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await Promise.all([0, 1, 2].map(index => tabs.nth(index).boundingBox()));
    expect(mobile[0]!.y).toBe(mobile[1]!.y);
    expect(mobile[1]!.y).toBe(mobile[2]!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('[data-section-name="media"]').click({ button: "right" });
    const menuBounds = await page.getByRole("menu", { name: "Section name actions" }).boundingBox();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(390);
    expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(844);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: testInfo.outputPath("admin-console-mobile.png"), fullPage: true, caret: "initial" });
  } finally {
    const restore = await apiAsPageUser(page, "/v1/admin/ui/page-descriptions", {
      method: "PUT", data: { adminSectionTitles: DEFAULT_ADMIN_SECTION_TITLES }
    });
    expect(restore.ok()).toBeTruthy();
  }
});
