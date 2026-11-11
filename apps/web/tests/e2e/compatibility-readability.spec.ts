import { expect, test } from "@playwright/test";
import { apiAsPageUser, ingestReviewedLibraryItems, registerAndSignIn, uniqueToken } from "./helpers";

test("QuadraPaddle search excludes unrelated hybrid groups and range display preserves saved rules", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  const frame = `readable-frame-${token}`, hybrid = `readable-hybrid-${token}`, other = `readable-other-${token}`;
  const quad = `readable-quad-${token}`, mini = `readable-mini-${token}`;
  const hybridPn = `HYBRID-${token}`, otherPn = `MINI-MODULE-${token}`, quadPn = `QUAD-${token}`, miniPn = `MINI-CONTACT-${token}`;
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
  const quadPositions = Array.from({ length: 10 }, (_, index) => letters.map(letter => `${letter}${index + 1}`)).flat();
  const miniPositions = Array.from({ length: 8 }, (_, index) => String(index + 11));
  const hybridDescription = "Signal/Mini Power/Mini Coax module, Receiver, QuadraPaddle, 100/8 position";
  await ingestReviewedLibraryItems(request, [
    { id: frame, category: "frame", family: "Test frame", partNumber: `FRAME-${token}`, description: "Receiver frame", isActive: true, stockStatus: "unknown", attributes: { slotIds: ["A", "B", "C", "D"] } },
    { id: hybrid, category: "module", family: "QuadraPaddle", partNumber: hybridPn, description: hybridDescription, isActive: true, stockStatus: "unknown", attributes: { pinIds: [...quadPositions, ...miniPositions] } },
    { id: other, category: "module", family: "Mini Power", partNumber: otherPn, description: "Mini Power module", isActive: true, stockStatus: "unknown", attributes: { pinIds: miniPositions } },
    { id: quad, category: "contact", family: "QuadraPaddle", partNumber: quadPn, description: "QuadraPaddle 5A Receiver signal contact", isActive: true, stockStatus: "unknown", attributes: {} },
    { id: mini, category: "contact", family: "Mini Power", partNumber: miniPn, description: "Mini Power Receiver contact", isActive: true, stockStatus: "unknown", attributes: {} }
  ]);
  await registerAndSignIn(page, { username: `readability-admin-${token}`, email: "meckert@vpc.com" });
  const rules = [
    { parentPartId: frame, targetPartIds: [hybrid, other], relationshipType: "MODULE_ALLOWED", parentPositions: ["A", "B", "D"], status: "allowed", isExhaustive: true },
    { parentPartId: hybrid, targetPartIds: [quad], relationshipType: "CONTACT_ALLOWED", positionType: "QUADRAPADDLE", parentPositions: quadPositions, status: "allowed", isExhaustive: true, source: "Manufacturer drawing", sourceStatus: "CONFIRMED", notes: "Keep exact source positions", extra: { revision: "C" } },
    { parentPartId: hybrid, targetPartIds: [mini], relationshipType: "CONTACT_ALLOWED", positionType: "MINI", parentPositions: miniPositions, status: "allowed", isExhaustive: true }
  ];
  for (const data of rules) expect((await apiAsPageUser(page, "/v1/library/relationships", { method: "PUT", data })).ok()).toBeTruthy();
  for (const [partId, caption] of [[hybrid, "QuadraPaddle module drawing"], [quad, "QuadraPaddle contact drawing"], [mini, "Mini Power contact drawing"]]) {
    expect((await apiAsPageUser(page, "/v1/library/media", { method: "PUT", data: { partId, caption, url: `https://example.test/${partId}.pdf`, viewType: "drawing" } })).ok()).toBeTruthy();
  }
  const readRules = async (parentId: string) => (await (await apiAsPageUser(page, `/v1/library/relationships?parentPartId=${parentId}`)).json()).items;
  const originalHybridRules = await readRules(hybrid);

  await page.goto("/admin?databaseTab=compatibility");
  const database = page.locator("#database");
  const search = database.getByRole("searchbox", { name: "Search", exact: true });
  const databaseTabs = database.getByRole("tablist", { name: "Database", exact: true });
  await search.fill("quadrapaddle");
  const compatibility = database.getByRole("tabpanel", { name: "Compatibility & Aliases", exact: true });
  const table = compatibility.getByRole("table");
  const quadRow = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "CONTACT_ALLOWED · QUADRAPADDLE", exact: true }) });
  const frameRow = table.getByRole("row").filter({ has: page.getByRole("cell", { name: "MODULE_ALLOWED", exact: true }) });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(quadRow.getByText(hybridDescription, { exact: true })).toBeVisible();
  await expect(quadRow.getByText("QuadraPaddle 5A Receiver signal contact", { exact: true })).toBeVisible();
  await expect(quadRow.getByRole("cell", { name: "A1–H10, J1–K10", exact: true })).toBeVisible();
  await expect(frameRow.getByRole("cell", { name: "A–B, D", exact: true })).toBeVisible();
  await expect(frameRow.getByText("Showing 1 of 2 compatible parts", { exact: true })).toBeVisible();
  await expect(table.getByText(miniPn, { exact: true })).toHaveCount(0);
  await expect(table.getByText(otherPn, { exact: true })).toHaveCount(0);
  await expect(table.getByRole("cell", { name: "CONTACT_ALLOWED · MINI", exact: true })).toHaveCount(0);

  // Both other sections already have matching results before their tabs are opened.
  const itemPanel = database.locator("#database-panel-items");
  await expect(itemPanel.getByRole("cell", { name: hybridPn, exact: true, includeHidden: true })).toHaveCount(1);
  await expect(itemPanel.getByRole("cell", { name: quadPn, exact: true, includeHidden: true })).toHaveCount(1);
  await expect(itemPanel.getByRole("cell", { name: miniPn, exact: true, includeHidden: true })).toHaveCount(0);
  const mediaPanel = database.locator("#database-panel-media");
  await expect(mediaPanel.getByRole("table", { includeHidden: true }).getByText("QuadraPaddle contact drawing", { exact: true })).toHaveCount(1);
  await expect(mediaPanel.getByRole("table", { includeHidden: true }).getByText("Mini Power contact drawing", { exact: true })).toHaveCount(0);
  await databaseTabs.getByRole("tab", { name: "Item Database Viewer", exact: true }).click();
  await expect(itemPanel.getByRole("cell", { name: quadPn, exact: true })).toBeVisible();
  await databaseTabs.getByRole("tab", { name: "Images and Files", exact: true }).click();
  await expect(mediaPanel.getByRole("table").getByText("QuadraPaddle contact drawing", { exact: true })).toBeVisible();
  await databaseTabs.getByRole("tab", { name: "Compatibility & Aliases", exact: true }).click();

  // Saving from a filtered view must preserve hidden targets and exact position IDs.
  await frameRow.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(compatibility.getByLabel("Compatible parts", { exact: true })).toHaveValue(`${hybridPn}, ${otherPn}`);
  await compatibility.getByRole("button", { name: "Add / update", exact: true }).click();
  await expect(compatibility.getByLabel("Compatible parts", { exact: true })).not.toBeVisible();
  expect((await readRules(frame))[0].targetPartIds).toEqual([hybrid, other]);
  await quadRow.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(compatibility.getByLabel("Parent positions", { exact: true })).toHaveValue(quadPositions.join(", "));
  await compatibility.getByRole("button", { name: "Add / update", exact: true }).click();
  await expect(compatibility.getByLabel("Parent positions", { exact: true })).not.toBeVisible();
  expect(await readRules(hybrid)).toEqual(originalHybridRules);
  await expect(search).toHaveValue("quadrapaddle");
  await page.screenshot({ path: testInfo.outputPath("compatibility-descriptions-ranges.png"), fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });

  await search.fill(hybridPn);
  await expect(table.getByRole("cell", { name: "CONTACT_ALLOWED · MINI", exact: true })).toBeVisible();
  await expect(table.getByText(miniPn, { exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "11–18", exact: true })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue(hybridPn);
  await expect(table.getByRole("cell", { name: "CONTACT_ALLOWED · MINI", exact: true })).toBeVisible();
});
