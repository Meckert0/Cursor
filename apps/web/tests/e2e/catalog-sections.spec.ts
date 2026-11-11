import { expect, test } from "@playwright/test";
import { apiAsPageUser, ingestReviewedLibraryItems, registerAndSignIn, uniqueToken } from "./helpers";

test.use({ actionTimeout: 15_000 });

test("catalog sections save label allowances, scoped compatibility, and oriented images", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  const frameId = `catalog-frame-${token}`, moduleId = `catalog-module-${token}`, labelId = `catalog-label-${token}`;
  const modulePn = `CAT-MOD-${token}`, labelPn = `00${token}`;
  await ingestReviewedLibraryItems(request, [
    { id: frameId, category: "frame", family: "Catalog test", partNumber: `CAT-FRM-${token}`, description: "Frame", isActive: true, stockStatus: "unknown", attributes: { slotIds: ["A", "B"] } },
    { id: moduleId, category: "module", family: "Catalog test", partNumber: modulePn, description: "Module", isActive: true, stockStatus: "in_stock", attributes: { pinIds: ["1", "2"] } },
    { id: labelId, category: "label", family: "Catalog test", partNumber: labelPn, description: "Label", isActive: true, stockStatus: "in_stock", attributes: { diaIn: 0.25 } }
  ]);
  await registerAndSignIn(page, { username: `catalog-admin-${token}`, email: "meckert@vpc.com" });
  await page.goto("/admin?category=label");
  await page.locator("summary", { hasText: "Item Database Viewer" }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: labelPn, exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Edit ${labelPn}`, exact: true });
  await dialog.getByLabel("Fits diameter min (in)", { exact: true }).fill("0.04");
  await dialog.getByLabel("Fits diameter max (in)", { exact: true }).fill("0.12");
  await dialog.getByLabel("Characters per line", { exact: true }).fill("18");
  await dialog.getByLabel("Maximum lines", { exact: true }).fill("2");
  await dialog.getByLabel("Print profile / font settings", { exact: true }).fill("Mono 8 pt");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const savedLabel = await apiAsPageUser(page, `/v1/library/components/${labelId}`);
  expect((await savedLabel.json()).attributes).toMatchObject({ fitDiameterMinIn: 0.04, fitDiameterMaxIn: 0.12, maxCharactersPerLine: 18, maxLines: 2, printProfile: "Mono 8 pt" });

  await page.locator("summary", { hasText: "Compatibility & Aliases" }).click();
  const groupForm = page.locator("form").filter({ has: page.getByRole("combobox", { name: "Relationship type", exact: true }) });
  await groupForm.getByRole("combobox", { name: "Parent part", exact: true }).selectOption(frameId);
  await groupForm.getByLabel("Compatible parts", { exact: true }).fill(modulePn);
  await groupForm.getByRole("combobox", { name: "Relationship type", exact: true }).fill("MODULE_ALLOWED");
  await groupForm.getByLabel("Parent positions", { exact: true }).fill("A");
  await groupForm.getByLabel("Source", { exact: true }).fill("Customer drawing");
  await groupForm.getByRole("button", { name: "Add / update", exact: true }).click();
  await expect.poll(async () => {
    const response = await apiAsPageUser(page, `/v1/library/relationships?parentPartId=${frameId}`);
    return (await response.json()).items[0]?.targetPartIds;
  }).toEqual([moduleId]);

  const imageUrl = "https://catalog.example.test/mating.png";
  await page.route(imageUrl, route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ9kAAAAASUVORK5CYII=", "base64") }));
  await page.locator("summary", { hasText: "Images and Files" }).click();
  const mediaSection = page.locator("#catalog-media");
  await mediaSection.getByRole("combobox", { name: "Filter by item", exact: true }).selectOption(moduleId);
  await mediaSection.getByRole("combobox", { name: "View", exact: true }).fill("mating_face");
  await mediaSection.getByLabel("Hosted file URL", { exact: true }).fill(imageUrl);
  await mediaSection.getByLabel("View direction (e.g. looking into mating face)", { exact: true }).fill("looking_into_mating_face");
  await mediaSection.getByLabel("Image description", { exact: true }).fill("Catalog test mating face");
  await mediaSection.getByLabel("File type (optional, e.g. image/png)", { exact: true }).fill("image/png");
  await mediaSection.getByLabel("Caption", { exact: true }).fill("Mating face drawing");
  await mediaSection.getByRole("button", { name: "Save image or file", exact: true }).click();
  await expect(mediaSection.getByRole("img", { name: "Catalog test mating face" })).toBeVisible();
  await page.reload();
  await page.locator("summary", { hasText: "Images and Files" }).click();
  await expect(page.getByRole("img", { name: "Catalog test mating face" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Catalog test mating face" })).toHaveJSProperty("naturalWidth", 1);
  await page.screenshot({ path: testInfo.outputPath("catalog-admin.png"), fullPage: true });
  await page.goto(`/library/${moduleId}`);
  await expect(page.getByRole("heading", { name: "Images and Files", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Catalog test mating face" })).toBeVisible();
  await expect(page.getByText("looking_into_mating_face", { exact: false })).toBeVisible();
});
