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
  await tabs.nth(2).click();
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
    await page.locator("summary", { hasText: "Edit section names" }).click();
    for (const [label, value] of [
      ["Page descriptions section", renamed.pageDescriptions],
      ["Users and projects section", renamed.userAccess],
      ["Database section", renamed.database],
      ["Item viewer tab", renamed.items],
      ["Compatibility tab", renamed.compatibility],
      ["Images and files tab", renamed.media]
    ]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Save section names", exact: true }).click();
    await expect(database.locator(":scope > details > summary")).toContainText(renamed.database);
    await page.reload();
    await expect(page.locator("main > section > details > summary").nth(0)).toContainText(renamed.pageDescriptions);
    await expect(page.locator("main > section > details > summary").nth(1)).toContainText(renamed.userAccess);
    await expect(database.getByRole("tab", { name: renamed.compatibility, exact: true })).toHaveAttribute("aria-selected", "true");
    for (const name of [renamed.items, renamed.compatibility, renamed.media]) await expect(database.getByRole("tab", { name, exact: true })).toBeVisible();
    const response = await apiAsPageUser(page, "/v1/ui/page-descriptions");
    expect((await response.json()).adminSectionTitles).toEqual(renamed);
    await page.screenshot({ path: testInfo.outputPath("admin-console-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await Promise.all([0, 1, 2].map(index => tabs.nth(index).boundingBox()));
    expect(mobile[0]!.y).toBe(mobile[1]!.y);
    expect(mobile[1]!.y).toBe(mobile[2]!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("admin-console-mobile.png"), fullPage: true });
  } finally {
    const restore = await apiAsPageUser(page, "/v1/admin/ui/page-descriptions", {
      method: "PUT", data: { adminSectionTitles: DEFAULT_ADMIN_SECTION_TITLES }
    });
    expect(restore.ok()).toBeTruthy();
  }
});
