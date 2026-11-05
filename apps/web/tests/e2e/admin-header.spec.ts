import { expect, test, type Page } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  ingestReviewedLibraryItems,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

async function expectAdminShortcut(page: Page, visible: boolean) {
  const header = page.locator("main > header");
  await expect(header).toBeVisible();
  await expect(page.locator("main > :first-child")).toHaveJSProperty("tagName", "HEADER");
  await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
  const shortcut = header.getByRole("link", { name: "Admin console", exact: true });
  if (!visible) {
    await expect(shortcut).toHaveCount(0);
    return;
  }
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toHaveAttribute("href", "/admin");
  const headerBox = await header.boundingBox();
  const shortcutBox = await shortcut.boundingBox();
  expect(headerBox).toBeTruthy();
  expect(shortcutBox).toBeTruthy();
  expect(headerBox!.x + headerBox!.width - shortcutBox!.x - shortcutBox!.width).toBeLessThanOrEqual(24);
}

for (const accountRole of ["admin", "regular"] as const) {
  test(`${accountRole} account sees the correct admin shortcut on every page`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const token = uniqueToken();
    const componentId = `header-module-${accountRole}-${token}`;
    await ingestReviewedLibraryItems(request, [{
      id: componentId,
      category: "module",
      family: "iCon",
      partNumber: `HEADER-MOD-${accountRole}-${token}`,
      description: "Header navigation test module",
      isActive: true,
      isReviewed: false,
      stockStatus: "in_stock",
      attributes: { pinCount: 2, pinIds: ["1", "2"] }
    }]);
    const isAdmin = accountRole === "admin";
    const adminEmail = (process.env.ADMIN_EMAILS ?? "meckert@vpc.com").split(",")[0]!.trim();
    await registerAndSignIn(page, {
      username: `header-${accountRole}-${token}`,
      email: isAdmin ? adminEmail : `header-regular-${token}@example.com`
    });
    await expectAdminShortcut(page, isAdmin);
    await createProjectAndOpenProjectPage(page, `Header project ${accountRole} ${token}`);
    const projectUrl = page.url();
    await expectAdminShortcut(page, isAdmin);
    await createHarnessOnProjectPage(page, `Header harness ${accountRole} ${token}`);
    const canvasUrl = page.url();
    const revisionUrl = await page.getByRole("link", { name: "Open Revision Workspace" }).getAttribute("href");
    await expectAdminShortcut(page, isAdmin);

    const routes = [
      canvasUrl.replace(/\/canvas$/, "/wirelist"),
      canvasUrl.replace(/\/canvas$/, "/details/new"),
      revisionUrl!,
      "/library",
      `/library/${componentId}`,
      ...(isAdmin ? ["/admin/datastores", "/admin"] : []),
      projectUrl
    ];
    for (const route of routes) {
      await page.goto(route);
      await expectAdminShortcut(page, isAdmin);
    }
    if (isAdmin) {
      await page.locator("main > header").getByRole("link", { name: "Admin console", exact: true }).click();
      await expect(page).toHaveURL("/admin");
      await expect(page.getByRole("heading", { name: "Admin console", exact: true })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expectAdminShortcut(page, true);
      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL("/login");
      await expect(page.getByRole("link", { name: "Admin console", exact: true })).toHaveCount(0);
    }
  });
}
