import { expect, test } from "@playwright/test";
import { apiAsPageUser, ingestReviewedLibraryItems, registerAndSignIn, uniqueToken } from "./helpers";

test("one search above the database tabs filters items, compatibility and images", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  const family = `Search modules ${token}`, frameFamily = `Search frames ${token}`;
  const frameA = `search-frame-a-${token}`, frameB = `search-frame-b-${token}`;
  const moduleA = `search-module-a-${token}`, moduleB = `search-module-b-${token}`;
  const framePn = `FRAME-A-${token}`, otherFramePn = `FRAME-B-${token}`;
  const modulePn = `MODULE-A-${token}`, otherModulePn = `MODULE-B-${token}`;
  await ingestReviewedLibraryItems(request, [
    { id: frameA, category: "frame", family: frameFamily, partNumber: framePn, description: "Search frame A", isActive: true, stockStatus: "unknown", attributes: { slotIds: ["A"] } },
    { id: frameB, category: "frame", family: frameFamily, partNumber: otherFramePn, description: "Search frame B", isActive: true, stockStatus: "unknown", attributes: { slotIds: ["A"] } },
    { id: moduleA, category: "module", family, partNumber: modulePn, description: "Search module A", isActive: true, stockStatus: "unknown", attributes: { pinIds: ["1"] } },
    { id: moduleB, category: "module", family, partNumber: otherModulePn, description: "Search module B", isActive: true, stockStatus: "unknown", attributes: { pinIds: ["1"] } }
  ]);
  await registerAndSignIn(page, { username: `search-admin-${token}`, email: "meckert@vpc.com" });
  const hydrationErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error" && /hydrat/i.test(message.text())) hydrationErrors.push(message.text()); });
  for (const data of [
    { parentPartId: frameA, targetPartIds: [moduleA, moduleB], relationshipType: "MODULE_ALLOWED", parentPositions: ["A"], status: "allowed" },
    { parentPartId: frameB, targetPartIds: [moduleB], relationshipType: "MODULE_ALLOWED", parentPositions: ["A"], status: "allowed" }
  ]) expect((await apiAsPageUser(page, "/v1/library/relationships", { method: "PUT", data })).ok()).toBeTruthy();
  for (const [partId, caption] of [[moduleA, "Matching module drawing"], [moduleB, "Other module drawing"], [frameA, "Frame drawing"]]) {
    expect((await apiAsPageUser(page, "/v1/library/media", {
      method: "PUT", data: { partId, caption, url: `https://example.test/${partId}.pdf`, viewType: "drawing" }
    })).ok()).toBeTruthy();
  }
  for (const [partId, code] of [[moduleA, "SEARCH-ALIAS-A"], [moduleB, "SEARCH-ALIAS-B"]]) {
    expect((await apiAsPageUser(page, "/v1/library/aliases", {
      method: "PUT", data: { partId, codeSystem: "search-test", code }
    })).ok()).toBeTruthy();
  }

  await page.goto("/admin?databaseTab=media");
  const database = page.locator("#database");
  const search = database.getByRole("search", { name: "Database search" });
  const tablist = database.getByRole("tablist", { name: "Database", exact: true });
  let navigationRequests = 0;
  page.on("request", request => { if (request.isNavigationRequest()) navigationRequests++; });
  await expect(search.getByRole("searchbox", { name: "Search", exact: true })).toHaveCount(1);
  await expect(search.getByRole("combobox")).toHaveCount(1);
  await expect(database.getByLabel("Filter by item", { exact: true })).toHaveCount(0);
  await expect(database.locator('input[type="search"]')).toHaveCount(1);
  await expect(database.locator('[role="tabpanel"] [role="search"]')).toHaveCount(0);
  await expect(search.locator('[name="category"], [name="awg"], [name="color"]')).toHaveCount(0);
  const searchBox = await search.boundingBox(), tabsBox = await tablist.boundingBox();
  expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(tabsBox!.y + 1);
  await search.getByRole("searchbox", { name: "Search", exact: true }).fill(modulePn.toLowerCase());
  await search.getByRole("combobox", { name: "Family", exact: true }).selectOption({ label: family });
  await search.getByRole("searchbox", { name: "Search", exact: true }).press("Enter");
  await expect(search.getByRole("link", { name: "Clear search", exact: true })).toBeVisible();
  await expect(tablist.getByRole("tab", { name: "Images and Files", exact: true })).toHaveAttribute("aria-selected", "true");
  const mediaPanel = database.getByRole("tabpanel", { name: "Images and Files", exact: true });
  await expect(mediaPanel.getByRole("table").getByText("Matching module drawing", { exact: true })).toBeVisible();
  await expect(mediaPanel.getByRole("table").getByText("Other module drawing", { exact: true })).toHaveCount(0);
  await expect(mediaPanel.getByRole("combobox")).toHaveCount(0);
  await expect(mediaPanel.locator('select[name="partId"]')).toHaveValue(moduleA);
  // Both hidden tabs already contain filtered results before they are selected.
  await expect(database.locator("#database-panel-items").getByRole("cell", { name: modulePn, exact: true, includeHidden: true })).toHaveCount(1);
  await expect(database.locator("#database-panel-items").getByRole("cell", { name: otherModulePn, exact: true, includeHidden: true })).toHaveCount(0);
  await expect(database.locator("#database-panel-compatibility").getByRole("cell", { name: framePn, exact: true, includeHidden: true })).toHaveCount(1);
  await expect(database.locator("#database-panel-compatibility").getByRole("cell", { name: otherFramePn, exact: true, includeHidden: true })).toHaveCount(0);
  await expect(search.getByRole("combobox", { name: "Family", exact: true }).getByRole("option", { name: frameFamily, exact: true })).toHaveCount(1);

  await tablist.getByRole("tab", { name: "Item Database Viewer", exact: true }).click();
  const itemsPanel = database.getByRole("tabpanel", { name: "Item Database Viewer", exact: true });
  await expect(itemsPanel.getByRole("cell", { name: modulePn, exact: true })).toBeVisible();
  await expect(itemsPanel.getByRole("cell", { name: otherModulePn, exact: true })).toHaveCount(0);
  await expect(itemsPanel.getByRole("searchbox")).toHaveCount(0);
  await tablist.getByRole("tab", { name: "Compatibility & Aliases", exact: true }).click();
  const compatibility = database.getByRole("tabpanel", { name: "Compatibility & Aliases", exact: true });
  const compatibilityTabs = compatibility.getByRole("tablist", { name: "Compatibility tables" });
  await expect(compatibilityTabs.getByRole("tab")).toHaveText(["Compatibility groups", "Aliases"]);
  await expect(compatibility.getByRole("textbox")).toHaveCount(0);
  await expect(compatibility.getByRole("combobox")).toHaveCount(0);
  await expect(compatibility.getByRole("cell", { name: framePn, exact: true })).toBeVisible();
  await expect(compatibility.getByRole("cell", { name: otherFramePn, exact: true })).toHaveCount(0);
  await expect(compatibility.getByRole("cell", { name: `${modulePn}, ${otherModulePn}`, exact: true })).toBeVisible();
  await compatibility.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(compatibility.getByLabel("Compatible parts", { exact: true })).toHaveValue(`${modulePn}, ${otherModulePn}`);
  await compatibility.getByRole("button", { name: "Cancel edit", exact: true }).click();
  await compatibility.getByRole("tab", { name: "Aliases", exact: true }).click();
  await expect(compatibility.getByRole("cell", { name: "SEARCH-ALIAS-A", exact: true })).toBeVisible();
  await expect(compatibility.getByRole("cell", { name: "SEARCH-ALIAS-B", exact: true })).toHaveCount(0);
  await search.getByRole("searchbox", { name: "Search", exact: true }).fill(`empty-${token}`);
  await expect(compatibilityTabs.getByRole("tab")).toHaveText(["Compatibility groups"]);
  await expect(compatibilityTabs.getByRole("tab", { name: "Compatibility groups", exact: true })).toHaveAttribute("aria-selected", "true");
  await search.getByRole("searchbox", { name: "Search", exact: true }).fill(modulePn.toLowerCase());
  await expect(compatibilityTabs.getByRole("tab", { name: "Aliases", exact: true })).toBeVisible();
  await expect(compatibility.getByRole("cell", { name: "SEARCH-ALIAS-A", exact: true })).toBeVisible();
  expect(navigationRequests).toBe(0);
  await page.reload();
  await expect(search.getByRole("searchbox", { name: "Search", exact: true })).toHaveValue(modulePn.toLowerCase());
  await expect(search.getByRole("combobox", { name: "Family", exact: true })).toHaveValue(family.toLowerCase());
  await expect(tablist.getByRole("tab", { name: "Compatibility & Aliases", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(compatibility.getByRole("cell", { name: otherFramePn, exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("shared-database-search.png"), fullPage: true, caret: "initial" });

  // Family and text intersect, and either endpoint can bring in a whole rule.
  await search.getByRole("searchbox", { name: "Search", exact: true }).fill(framePn);
  await expect(compatibility.getByText("No compatibility groups found.", { exact: true })).toBeVisible();
  await search.getByRole("combobox", { name: "Family", exact: true }).selectOption({ label: frameFamily });
  await expect(compatibility.getByRole("cell", { name: framePn, exact: true })).toBeVisible();
  await tablist.getByRole("tab", { name: "Images and Files", exact: true }).click();
  await expect(mediaPanel.getByRole("table").getByText("Frame drawing", { exact: true })).toBeVisible();
  await expect(mediaPanel.getByRole("table").getByText("Matching module drawing", { exact: true })).toHaveCount(0);

  await search.getByRole("searchbox", { name: "Search", exact: true }).fill(`no-such-item-${token}`);
  await expect(mediaPanel.getByText("No images or files found.", { exact: true })).toBeVisible();
  await tablist.getByRole("tab", { name: "Item Database Viewer", exact: true }).click();
  await expect(itemsPanel.getByText("No items found for current filters.", { exact: true })).toBeVisible();
  await tablist.getByRole("tab", { name: "Compatibility & Aliases", exact: true }).click();
  await expect(compatibility.getByText("No compatibility groups found.", { exact: true })).toBeVisible();
  await search.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(search.getByRole("searchbox", { name: "Search", exact: true })).toHaveValue("");
  await expect(search.getByRole("combobox", { name: "Family", exact: true })).toHaveValue("");
  await expect(compatibility.getByRole("cell", { name: otherFramePn, exact: true })).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
