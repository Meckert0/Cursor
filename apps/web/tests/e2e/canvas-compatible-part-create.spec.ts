import { expect, test, type Page } from "@playwright/test";
import {
  apiAsPageUser,
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  getAdminSessionCookie,
  ingestReviewedLibraryItems,
  putPartRelationship,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test.use({ actionTimeout: 15_000 });

async function fillNewPart(page: Page, category: "module" | "frame" | "backshell" | "strain-relief", partNumber: string, description: string) {
  const dialog = page.getByRole("dialog", { name: "Create new Item", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Category", exact: true }).selectOption(category);
  await dialog.getByLabel("Part number", { exact: true }).fill(partNumber);
  await dialog.getByLabel("Family", { exact: true }).fill("User custom accessories");
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  return dialog;
}

test("regular users create compatible accessories on connectors and frame modules while empty selectors stay hidden", async ({ page, request, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  const prefix = `QUICK-ACCESSORY-${token}`;
  const standalone = `${prefix}-MODULE`, slotModule = `${prefix}-SLOT`, blank = `${prefix}-BLANK`, frame = `${prefix}-FRAME`;
  const backshellPn = `${prefix}-BS`, reliefPn = `${prefix}-SR`;
  const common = { family: "Accessory test", isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    ...[standalone, slotModule].map(id => ({ ...common, id, category: "module", partType: "MODULE", partNumber: id, description: "Signal module", attributes: { pinCount: 1, pinIds: ["1"] } })),
    { ...common, id: blank, category: "module", partType: "MODULE", partNumber: blank, description: "Blank module", electricalMode: "NONE", attributes: { pinIds: [] } },
    { ...common, id: frame, category: "frame", partType: "ITA", partNumber: frame, description: "Two-slot frame", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } }
  ]);
  await putPartRelationship(request, { parentPartId: frame, compatibleParts: [slotModule, blank], relationshipType: "MODULE_ALLOWED", parentPositions: ["A", "B"], status: "allowed" });
  await registerAndSignIn(page, { username: `accessory-user-${token}`, email: `accessory-user-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, prefix);
  await createHarnessOnProjectPage(page, prefix);
  const harnessId = /\/harnesses\/([^/]+)\/canvas/.exec(page.url())![1];
  const harnessResponse = await apiAsPageUser(page, `/v1/harnesses/${harnessId}`);
  expect(harnessResponse.ok()).toBeTruthy();
  const revisionId = (await harnessResponse.json()).currentRevisionId as string;
  const readRevision = async () => {
    const response = await apiAsPageUser(page, `/v1/revisions/${revisionId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const initial = await readRevision();
  const patched = await apiAsPageUser(page, `/v1/revisions/${revisionId}/snapshot`, { method: "PATCH", data: {
    expectedSnapshotHash: initial.snapshotHash,
    snapshot: { ...initial.snapshot, connectors: [
      { id: "standalone", reference: "J1", partNumber: standalone, libraryComponentId: standalone, pins: [{ id: "1", number: "1" }], location: { x: 20, y: 40 } },
      { id: "frame", reference: "J2", partNumber: frame, libraryComponentId: frame, pins: [{ id: "A:1", number: "1" }], location: { x: 220, y: 40 }, slots: [
        { slotId: "A", reference: "J2A", partNumber: slotModule, libraryComponentId: slotModule, pins: [{ id: "1", number: "1" }] },
        { slotId: "B", reference: "J2B", partNumber: blank, libraryComponentId: blank, pins: [] }
      ] }
    ], paths: [] }
  } });
  expect(patched.ok()).toBeTruthy();
  await page.reload();

  await page.getByRole("button", { name: "Connector J1", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Backshell", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Strain relief", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create new Item", exact: true }).click();
  const backshellDialog = await fillNewPart(page, "backshell", backshellPn, "New backshell for the standalone connector");
  await backshellDialog.screenshot({ path: testInfo.outputPath("create-new-item.png") });
  await backshellDialog.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(backshellDialog).not.toBeVisible();
  const backshellSelect = page.getByRole("combobox", { name: "Backshell", exact: true });
  await expect(backshellSelect).toBeVisible();
  const backshellId = await backshellSelect.inputValue();
  expect(backshellId).not.toBe("");
  await expect(backshellSelect.locator(`option[value="${backshellId}"]`)).toContainText(backshellPn);
  await expect(page.getByRole("combobox", { name: "Strain relief", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readRevision()).snapshot.connectors[0].backshellLibraryComponentId).toBe(backshellId);
  const createdBackshellResponse = await apiAsPageUser(page, `/v1/library/components/${backshellId}`);
  expect(createdBackshellResponse.ok()).toBeTruthy();
  const createdBackshell = await createdBackshellResponse.json();
  expect(createdBackshell).toMatchObject({ category: "backshell", partNumber: backshellPn, isReviewed: false });
  const rulesResponse = await apiAsPageUser(page, `/v1/library/relationships?parentPartId=${standalone}`);
  expect((await rulesResponse.json()).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ relationshipType: "BACKSHELL_ALLOWED", targetPartIds: [backshellId], status: "allowed" })
  ]));

  await page.getByRole("button", { name: "Create new Item", exact: true }).click();
  const duplicateDialog = await fillNewPart(page, "backshell", backshellPn, "This duplicate must not replace the original");
  await duplicateDialog.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(duplicateDialog).toBeVisible();
  const duplicateError = duplicateDialog.getByRole("alert");
  await expect(duplicateError).toContainText(/already exists|already in|duplicate/i);
  await expect(duplicateError).not.toContainText("statusCode");
  await expect(duplicateError).not.toContainText("API 409");
  const afterDuplicate = await apiAsPageUser(page, `/v1/library/components/${backshellId}`);
  expect((await afterDuplicate.json()).description).toBe(createdBackshell.description);
  await duplicateDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Frame J2", exact: true }).click();
  const slotA = page.getByRole("article", { name: "Slot A module", exact: true });
  const slotB = page.getByRole("article", { name: "Slot B module", exact: true });
  await expect(page.getByRole("combobox", { name: "Slot A backshell", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Slot A strain relief", exact: true })).toHaveCount(0);
  await slotB.getByRole("button", { name: "Create new Item", exact: true }).click();
  const blankDialog = page.getByRole("dialog", { name: "Create new Item", exact: true });
  const categories = blankDialog.getByRole("combobox", { name: "Category", exact: true });
  await expect(categories.locator('option[value="strain-relief"]')).toHaveJSProperty("disabled", true);
  await expect(categories.locator('option[value="backshell"]')).toHaveJSProperty("disabled", false);
  await blankDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await slotA.getByRole("button", { name: "Create new Item", exact: true }).click();
  const reliefDialog = await fillNewPart(page, "strain-relief", reliefPn, "New strain relief for slot A");
  await reliefDialog.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(reliefDialog).not.toBeVisible();
  const slotReliefSelect = page.getByRole("combobox", { name: "Slot A strain relief", exact: true });
  const reliefId = await slotReliefSelect.inputValue();
  expect(reliefId).not.toBe("");
  await expect(slotReliefSelect.locator(`option[value="${reliefId}"]`)).toContainText(reliefPn);
  await expect(page.getByRole("combobox", { name: "Slot A backshell", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Slot B strain relief", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readRevision()).snapshot.connectors[1].slots[0].strainReliefLibraryComponentId).toBe(reliefId);
  const createdRelief = await apiAsPageUser(page, `/v1/library/components/${reliefId}`);
  expect((await createdRelief.json())).toMatchObject({ category: "strain-relief", partNumber: reliefPn, isReviewed: false });
  const slotRules = await apiAsPageUser(page, `/v1/library/relationships?parentPartId=${slotModule}`);
  expect((await slotRules.json()).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ relationshipType: "STRAIN_RELIEF_ALLOWED", targetPartIds: [reliefId], status: "allowed" })
  ]));

  await page.reload();
  await page.getByRole("button", { name: "Frame J2", exact: true }).click();
  await expect(slotReliefSelect).toHaveValue(reliefId);
  await page.getByRole("button", { name: "Connector J1", exact: true }).click();
  await expect(backshellSelect).toHaveValue(backshellId);
  await expect(page.getByRole("combobox", { name: "Strain relief", exact: true })).toHaveCount(0);

  const adminCookie = await getAdminSessionCookie(request);
  const adminContext = await browser.newContext({ baseURL });
  try {
    await adminContext.addCookies([{ name: "cdt_session", value: adminCookie.slice("cdt_session=".length), url: baseURL! }]);
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/harnesses/${harnessId}/canvas`);
    await expect(adminPage.getByRole("button", { name: "Connector J1", exact: true })).toBeDisabled();
    await expect(adminPage.getByRole("button", { name: "Create new Item", exact: true })).toBeDisabled();
  } finally { await adminContext.close(); }
});

test("Create new Item is compact and right aligned and adds modules and frames to an empty canvas", async ({ page }, testInfo) => {
  const token = uniqueToken();
  const modulePn = `NEW-MODULE-${token}`, framePn = `NEW-FRAME-${token}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await registerAndSignIn(page, { username: `new-item-${token}`, email: `new-item-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `New item project ${token}`);
  await createHarnessOnProjectPage(page, `New item harness ${token}`);
  const harnessId = /\/harnesses\/([^/]+)\/canvas/.exec(page.url())![1];
  const harness = await (await apiAsPageUser(page, `/v1/harnesses/${harnessId}`)).json();
  const revisionId = harness.currentRevisionId;
  const readRevision = async () => (await apiAsPageUser(page, `/v1/revisions/${revisionId}`)).json();
  const initial = await readRevision();
  const button = page.getByRole("button", { name: "Create new Item", exact: true });
  const measure = () => button.evaluate(element => ({
    rightGap: element.parentElement!.getBoundingClientRect().right - element.getBoundingClientRect().right,
    height: element.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(element).fontSize)
  }));
  const emptySize = await measure();
  expect(emptySize.rightGap).toBeLessThan(2);
  expect(emptySize.height).toBeLessThan(30);
  expect(emptySize.fontSize).toBeLessThanOrEqual(11);
  await expect(page.getByRole("button", { name: "Add compatible part", exact: true })).toHaveCount(0);
  await button.click();
  const dialog = await fillNewPart(page, "module", modulePn, "Created module / connector");
  const category = dialog.getByRole("combobox", { name: "Category", exact: true });
  for (const value of ["module", "frame", "backshell", "strain-relief"]) await expect(category.locator(`option[value="${value}"]`)).toHaveCount(1);
  await dialog.locator("summary").click();
  await dialog.getByLabel("Pin count", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Change connector", exact: true })).toContainText(modulePn);
  await expect.poll(async () => (await readRevision()).snapshot.connectors.length).toBe(initial.snapshot.connectors.length + 1);
  const createdModule = (await readRevision()).snapshot.connectors.find((part: { partNumber: string }) => part.partNumber === modulePn);
  expect(createdModule.pins).toHaveLength(2);
  expect((await measure()).rightGap).toBeLessThan(2);
  await button.click();
  const frameDialog = await fillNewPart(page, "frame", framePn, "Created receiver frame");
  await frameDialog.getByRole("combobox", { name: "Housing type", exact: true }).selectOption("RECEIVER");
  await frameDialog.getByLabel("Module capacity", { exact: true }).fill("3");
  await frameDialog.screenshot({ path: testInfo.outputPath("create-frame.png") });
  await frameDialog.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(frameDialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Change frame", exact: true })).toContainText(framePn);
  await expect(page.getByRole("button", { name: "Define slot A module", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Define slot C module", exact: true })).toBeVisible();
  await expect.poll(async () => (await readRevision()).snapshot.connectors.length).toBe(initial.snapshot.connectors.length + 2);
  const saved = await readRevision();
  const frame = saved.snapshot.connectors.find((part: { partNumber: string }) => part.partNumber === framePn);
  expect(frame.slots.map((slot: { slotId: string }) => slot.slotId)).toEqual(["A", "B", "C"]);
  const catalog = await (await apiAsPageUser(page, `/v1/library/components/${frame.libraryComponentId}`)).json();
  expect(catalog).toMatchObject({ category: "frame", partType: "RECEIVER", side: "RECEIVER", isReviewed: false });
  await page.reload();
  await expect(page.getByRole("button", { name: `Connector ${createdModule.reference}`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Frame ${frame.reference}`, exact: true })).toBeVisible();
});
