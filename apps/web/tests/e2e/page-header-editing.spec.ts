import { expect, test } from "@playwright/test";
import { formatPageHeaderText, type PageKey, type PageHeaderCopy } from "../../../../src/domain/ui-settings";
import { apiAsPageUser, createHarnessOnProjectPage, createProjectAndOpenProjectPage, expectHeadingWithRetry, ingestReviewedLibraryItems, registerAndSignIn, uniqueToken } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("admins edit every page header in place and changes are shared with regular users and signed-out visitors", async ({ page, browser, request, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  const token = uniqueToken();
  const partId = `page-header-part-${token}`, partNumber = `HEADER-${token}`;
  await ingestReviewedLibraryItems(request, [{ id: partId, category: "module", family: "Test", partNumber, description: "Header test part", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { pinCount: 1, pinIds: ["1"] } }]);
  await registerAndSignIn(page, { username: `header-admin-${token}`, email: "meckert@vpc.com" });
  await createProjectAndOpenProjectPage(page, `Admin project ${token}`);
  const adminProject = page.url();
  await createHarnessOnProjectPage(page, `Admin harness ${token}`);
  const adminCanvas = page.url();
  const adminRevision = (await page.getByRole("link", { name: "Open Revision Workspace" }).getAttribute("href"))!;

  const regularContext = await browser.newContext({ baseURL });
  const regularPage = await regularContext.newPage();
  await registerAndSignIn(regularPage, { username: `header-reader-${token}`, email: `header-reader-${token}@example.com` });
  await createProjectAndOpenProjectPage(regularPage, `Reader project ${token}`);
  const regularProject = regularPage.url();
  await createHarnessOnProjectPage(regularPage, `Reader harness ${token}`);
  const regularCanvas = regularPage.url();
  const regularRevision = (await regularPage.getByRole("link", { name: "Open Revision Workspace" }).getAttribute("href"))!;
  const original = new Map<PageKey, PageHeaderCopy>();
  const updated = new Map<PageKey, PageHeaderCopy>();
  const routes: Array<[PageKey, string, string | undefined]> = [
    ["projects", "/", "/"], ["project", adminProject, regularProject],
    ["canvas", adminCanvas, regularCanvas],
    ["wirelist", adminCanvas.replace(/\/canvas$/, "/wirelist"), regularCanvas.replace(/\/canvas$/, "/wirelist")],
    ["details", adminCanvas.replace(/\/canvas$/, "/details/new"), regularCanvas.replace(/\/canvas$/, "/details/new")],
    ["revision", adminRevision, regularRevision], ["library", "/library", "/library"],
    ["libraryItem", `/library/${partId}`, `/library/${partId}`],
    ["admin", "/admin", undefined], ["datastores", "/admin/datastores", undefined],
    ["login", "/login", undefined], ["register", "/register", undefined]
  ];
  const guestContext = await browser.newContext({ baseURL });
  try {
    for (const [key, route] of routes) {
      const read = await apiAsPageUser(page, `/v1/ui/page-headers/${key}`);
      expect(read.ok()).toBeTruthy();
      const old = await read.json() as PageHeaderCopy;
      original.set(key, old);
      await page.goto(route);
      const heading = page.locator(`[data-page-title="${key}"]`);
      // New routes occasionally need a second request while the development server compiles.
      if (await page.getByRole("heading", { name: "404", exact: true }).isVisible()) await page.reload();
      await expect(heading).toBeVisible();
      await heading.click({ button: "right" });
      const editor = page.getByRole("dialog", { name: "Rename page header", exact: true });
      await expect(editor.getByLabel("Page title", { exact: true })).toBeFocused();
      if (key === "projects") {
        await editor.getByLabel("Page title", { exact: true }).fill("Unsaved");
        await page.keyboard.press("Escape");
        await expect(editor).toHaveCount(0);
        await expect(heading).toHaveText(old.title);
        await expect(heading).toBeFocused();
        await heading.press("Shift+F10");
        await editor.getByLabel("Page title", { exact: true }).fill("   ");
        await editor.getByRole("button", { name: "Save changes", exact: true }).click();
        await expect(editor.getByRole("alert")).toContainText("1–120");
      }
      const copy = { title: key === "libraryItem" ? "Part {partNumber}" : `Updated ${key} ${token}`, description: key === "wirelist" ? "Harness {harnessName}: revised instructions" : `Shared description for ${key}` };
      updated.set(key, copy);
      await editor.getByLabel("Page title", { exact: true }).fill(copy.title);
      await editor.getByLabel("Page description", { exact: true }).fill(copy.description);
      await editor.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(editor).toHaveCount(0);
      const saved = await apiAsPageUser(page, `/v1/ui/page-headers/${key}`);
      expect(await saved.json()).toEqual(copy);
      await expect(heading).toHaveText(formatPageHeaderText(copy.title, { partNumber }));
      const expectedDescription = formatPageHeaderText(copy.description, { harnessName: `Admin harness ${token}` });
      await expect(page.locator(`[data-page-description="${key}"]`)).toHaveText(expectedDescription);
      if (key === "canvas") {
        await page.locator(`[data-page-description="${key}"]`).click({ button: "right" });
        await expect(editor.getByLabel("Page description", { exact: true })).toBeFocused();
        await editor.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath("admin-editable-page-header.png"), fullPage: true });
      }
      if (key === "admin") {
        await expect(page.getByText("Global Page Descriptions", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Save descriptions", exact: true })).toHaveCount(0);
        await expect(page.locator('[data-section-name="pageDescriptions"]')).toHaveCount(0);
      }
    }

    for (const [key, , regularRoute] of routes) {
      if (!regularRoute) continue;
      const copy = updated.get(key)!;
      await regularPage.goto(regularRoute);
      await expectHeadingWithRetry(regularPage, formatPageHeaderText(copy.title, { partNumber }));
      const heading = regularPage.locator(`[data-page-title="${key}"]`);
      await expect(heading).not.toHaveAttribute("tabindex");
      await heading.click({ button: "right" });
      await expect(regularPage.getByRole("dialog", { name: "Rename page header", exact: true })).toHaveCount(0);
      await regularPage.keyboard.press("Escape");
      await expect(regularPage.locator(`[data-page-description="${key}"]`)).toHaveText(formatPageHeaderText(copy.description, { harnessName: `Reader harness ${token}` }));
    }
    const blocked = await apiAsPageUser(regularPage, "/v1/admin/ui/page-headers/projects", { method: "PUT", data: { title: "Unauthorized change" } });
    expect(blocked.status()).toBe(403);
    const guest = await guestContext.newPage();
    for (const key of ["login", "register"] as const) {
      await guest.goto(`/${key}`);
      await expectHeadingWithRetry(guest, updated.get(key)!.title);
      await expect(guest.getByRole("link", { name: "Admin console", exact: true })).toHaveCount(0);
      await guest.locator(`[data-page-title="${key}"]`).click({ button: "right" });
      await expect(guest.getByRole("dialog", { name: "Rename page header", exact: true })).toHaveCount(0);
      await guest.keyboard.press("Escape");
    }
    await page.reload();
    await expect(page.locator('[data-page-title="register"]')).toHaveText(updated.get("register")!.title);
  } finally {
    for (const [key, copy] of original) {
      const restore = await apiAsPageUser(page, `/v1/admin/ui/page-headers/${key}`, { method: "PUT", data: copy });
      expect(restore.ok()).toBeTruthy();
    }
    await regularContext.close();
    await guestContext.close();
  }
});
