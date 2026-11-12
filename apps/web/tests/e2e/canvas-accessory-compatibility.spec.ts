import { expect, test } from "@playwright/test";
import {
  apiAsPageUser,
  createProjectAndOpenProjectPage,
  expectHeadingWithRetry,
  getAdminSessionCookie,
  ingestReviewedLibraryItems,
  putPartRelationship,
  registerAndSignIn,
  selectConnectorPickerPart,
  uniqueToken
} from "./helpers";

test("canvas and part views honor strain-relief-owned module fits, preserve selections, and reject blanks", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(180_000);
  const prefix = `SR-${uniqueToken()}`;
  const moduleId = "strain-test-510160101", reliefId = "strain-test-310123102";
  const otherModule = `${prefix}-MODULE`, blank = `${prefix}-BLANK`, frame = `${prefix}-FRAME`;
  const sibling = `${prefix}-SIBLING`, legacy = `${prefix}-LEGACY`, forbidden = `${prefix}-FORBIDDEN`, review = `${prefix}-REVIEW`, unlisted = `${prefix}-UNLISTED`, inactive = `${prefix}-INACTIVE`;
  const common = { family: "iSeries", isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: moduleId, category: "module", partType: "MODULE", partNumber: "510160101", description: "iSeries 160-position module", attributes: { pinCount: 1, pinIds: ["1"] } },
    { ...common, id: otherModule, category: "module", partType: "MODULE", partNumber: otherModule, description: "Other compatible module", attributes: { pinCount: 1, pinIds: ["1"] } },
    { ...common, id: blank, category: "module", partType: "MODULE", partNumber: blank, description: "Blank module", electricalMode: "NONE", attributes: { positionCount: 160, pinIds: [] } },
    { ...common, id: frame, category: "frame", partType: "ITA", partNumber: frame, description: "Two-slot frame", attributes: { slotIds: ["A", "B"], moduleCapacity: 2 } },
    { ...common, id: reliefId, category: "strain-relief", partNumber: "310123102", description: "iSeries strain relief", attributes: {} },
    ...[sibling, legacy, forbidden, review, unlisted, inactive].map(id => ({ ...common, id, category: "strain-relief", partNumber: id, description: id, isActive: id !== inactive, attributes: {} }))
  ]);
  await putPartRelationship(request, { parentPartId: frame, compatibleParts: ["510160101", otherModule, blank], relationshipType: "MODULE_ALLOWED", parentPositions: [], status: "allowed" });
  for (const parentPartId of [reliefId, sibling, forbidden, review, inactive]) {
    await putPartRelationship(request, { parentPartId, compatibleParts: ["510160101", otherModule, blank], relationshipType: "MATES_WITH", parentPositions: [], status: "allowed" });
  }
  for (const [target, status] of [[forbidden, "forbidden"], [review, "review"]] as const) {
    await putPartRelationship(request, { parentPartId: moduleId, compatibleParts: [target], relationshipType: "STRAIN_RELIEF_ALLOWED", parentPositions: [], status });
  }
  // The legacy API is still supported alongside grouped catalog relationships.
  const adminCookie = await getAdminSessionCookie(request);
  for (const strainReliefPartId of [legacy, forbidden]) {
    const response = await request.put("http://127.0.0.1:3000/v1/library/compat/module-strain-relief", {
      headers: { cookie: adminCookie },
      data: { modulePartId: moduleId, strainReliefPartId, status: "allowed" }
    });
    expect(response.ok()).toBeTruthy();
  }
  const invalidBlankPair = await request.put("http://127.0.0.1:3000/v1/library/compat/module-strain-relief", {
    headers: { cookie: adminCookie }, data: { modulePartId: blank, strainReliefPartId: reliefId, status: "allowed" }
  });
  expect(invalidBlankPair.status()).toBe(400);
  expect(await invalidBlankPair.text()).toContain("COMPATIBILITY_BLANK_MODULE_STRAIN_RELIEF");

  await registerAndSignIn(page, { username: prefix, email: `${prefix}@example.com` });
  await createProjectAndOpenProjectPage(page, prefix);
  const projectId = /\/projects\/([^/]+)/.exec(page.url())![1];
  const created = await apiAsPageUser(page, `/v1/projects/${projectId}/harnesses`, { method: "POST", data: { name: prefix, createdBy: "strain-test" } });
  expect(created.ok()).toBeTruthy();
  const harness = await created.json();
  const revisionId = harness.currentRevisionId as string;
  const readRevision = async () => {
    const response = await apiAsPageUser(page, `/v1/revisions/${revisionId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const initial = await readRevision();
  const moduleSelection = { partNumber: "510160101", libraryComponentId: moduleId, strainReliefPartNumber: "310123102", strainReliefLibraryComponentId: reliefId, pins: [{ id: "1", number: "1" }] };
  const blankSelection = { ...moduleSelection, partNumber: blank, libraryComponentId: blank, pins: [] };
  const patched = await apiAsPageUser(page, `/v1/revisions/${revisionId}/snapshot`, { method: "PATCH", data: {
    expectedSnapshotHash: initial.snapshotHash,
    snapshot: { ...initial.snapshot, connectors: [
      { ...moduleSelection, id: "standalone", reference: "J1", location: { x: 20, y: 40 } },
      { id: "frame", reference: "J2", partNumber: frame, libraryComponentId: frame, pins: [{ id: "A:1", number: "1" }], location: { x: 220, y: 40 }, slots: [
        { ...moduleSelection, slotId: "A", reference: "J2A" },
        { ...blankSelection, slotId: "B", reference: "J2B" }
      ] },
      { ...blankSelection, id: "blank", reference: "J3", location: { x: 420, y: 40 } }
    ], paths: [] }
  } });
  expect(patched.ok()).toBeTruthy();

  const rulesResponse = await apiAsPageUser(page, "/v1/library/relationships");
  const rules = (await rulesResponse.json()).items;
  expect(rules.some((row: { parentPartId: string; targetPartIds: string[] }) => row.parentPartId === reliefId && row.targetPartIds.includes(moduleId))).toBeTruthy();
  expect(rules.some((row: { parentPartId: string; targetPartIds: string[] }) => row.parentPartId === moduleId && row.targetPartIds.includes(reliefId))).toBeFalsy();
  expect(rules.find((row: { parentPartId: string }) => row.parentPartId === reliefId).targetPartIds.sort()).toEqual([moduleId, otherModule].sort());
  expect(rules.find((row: { parentPartId: string }) => row.parentPartId === frame).targetPartIds).toContain(blank);
  const validation = await apiAsPageUser(page, `/v1/revisions/${revisionId}/validate`, { method: "POST", data: { rulesetVersion: "rules-2026.04", mode: "full" } });
  expect(validation.ok()).toBeTruthy();
  const findings = (await validation.json()).results.filter((result: { code: string }) => result.code === "RULE_COMPAT_MODULE_STRAIN_RELIEF");
  expect(findings.map((result: { entityId: string }) => result.entityId).sort()).toEqual(["blank", "frame"]);

  const adminContext = await browser.newContext({ baseURL });
  try {
    await adminContext.addCookies([{ name: "cdt_session", value: adminCookie.slice("cdt_session=".length), url: baseURL! }]);
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin?databaseTab=compatibility&q=310123102");
    const sourceRow = adminPage.getByRole("tabpanel", { name: "Compatibility & Aliases", exact: true }).getByRole("row")
      .filter({ has: adminPage.getByRole("cell", { name: "310123102", exact: true }) });
    await expect(sourceRow).not.toContainText(blank);
    await expect(sourceRow).toContainText("510160101");
    await sourceRow.getByRole("button", { name: "Edit", exact: true }).click();
    const targets = adminPage.getByRole("textbox", { name: "Compatible parts", exact: true });
    await expect(targets).not.toHaveValue(new RegExp(blank));
    await expect(targets).toHaveValue(new RegExp("510160101"));
    await adminPage.getByRole("button", { name: "Cancel edit", exact: true }).click();
    await adminPage.goto("/admin?databaseTab=compatibility");
    await adminPage.getByRole("tab", { name: "Module ↔ Strain relief", exact: true }).click();
    const pairRow = adminPage.getByRole("row").filter({ has: adminPage.getByRole("cell", { name: blank, exact: true }) });
    await expect(pairRow).toHaveCount(0);
    await adminPage.locator("summary", { hasText: "Add module–strain relief pair" }).click();
    await expect(adminPage.getByRole("combobox", { name: "Module", exact: true }).locator(`option[value="${blank}"]`)).toHaveCount(0);
  } finally { await adminContext.close(); }

  await page.goto(`/library/${moduleId}`);
  await expect(page.getByRole("list", { name: "Compatible strain reliefs", exact: true }).getByRole("link", { name: "310123102", exact: true })).toBeVisible();
  await page.goto(`/library/${reliefId}`);
  const modules = page.getByRole("list", { name: "Compatible modules", exact: true });
  await expect(modules.getByRole("link", { name: "510160101", exact: true })).toBeVisible();
  await expect(modules.getByRole("link", { name: blank, exact: true })).toHaveCount(0);
  await page.goto(`/library/${blank}`);
  await expect(page.getByRole("list", { name: "Compatible strain reliefs", exact: true })).toHaveCount(0);
  await expect(page.getByText("No compatible strain reliefs recorded.", { exact: true })).toBeVisible();

  await page.goto(`/harnesses/${harness.id}/canvas`);
  await expectHeadingWithRetry(page, "Harness Canvas");
  const saved = async () => expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Connector J1", exact: true }).click();
  const strainSelect = page.getByRole("combobox", { name: "Strain relief", exact: true });
  await expect(strainSelect).toHaveValue(reliefId);
  await expect(strainSelect.locator("option")).toHaveCount(4);
  for (const id of [reliefId, sibling, legacy]) await expect(strainSelect.locator(`option[value="${id}"]`)).toBeEnabled();
  for (const id of [forbidden, review, unlisted, inactive]) await expect(strainSelect.locator(`option[value="${id}"]`)).toHaveCount(0);
  await strainSelect.selectOption(sibling);
  await expect.poll(async () => (await readRevision()).snapshot.connectors[0].strainReliefLibraryComponentId).toBe(sibling);

  await page.getByRole("button", { name: "Change connector", exact: true }).click();
  await selectConnectorPickerPart(page, otherModule);
  await expect(strainSelect).toHaveValue(sibling);
  await page.getByRole("button", { name: "Change connector", exact: true }).click();
  await selectConnectorPickerPart(page, blank);
  await expect(strainSelect).toHaveValue("");
  await expect(strainSelect.locator("option")).toHaveCount(1);
  await expect.poll(async () => (await readRevision()).snapshot.connectors[0].partNumber).toBe(blank);
  expect((await readRevision()).snapshot.connectors[0].strainReliefLibraryComponentId).toBeUndefined();

  await page.getByRole("button", { name: "Frame J2", exact: true }).click();
  const slotSelect = page.getByRole("combobox", { name: "Slot A strain relief", exact: true });
  await expect(slotSelect).toHaveValue(reliefId);
  await expect(slotSelect.locator("option")).toHaveCount(4);
  const blankSlotSelect = page.getByRole("combobox", { name: "Slot B strain relief", exact: true });
  await expect(blankSlotSelect.locator(`option[value="${reliefId}"]`)).toHaveJSProperty("disabled", true);
  await blankSlotSelect.selectOption("");
  await expect(blankSlotSelect.locator("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Change slot A module", exact: true }).click();
  await selectConnectorPickerPart(page, otherModule, "module");
  await expect(slotSelect).toHaveValue(reliefId);
  await page.getByRole("button", { name: "Change slot A module", exact: true }).click();
  await selectConnectorPickerPart(page, blank, "module");
  await expect(slotSelect).toHaveValue("");
  await expect(slotSelect.locator("option")).toHaveCount(1);
  await expect.poll(async () => (await readRevision()).snapshot.connectors[1].slots[0].partNumber).toBe(blank);
  expect((await readRevision()).snapshot.connectors[1].slots[0].strainReliefLibraryComponentId).toBeUndefined();
  await saved();
  await page.reload();
  await page.getByRole("button", { name: "Connector J1", exact: true }).click();
  await expect(strainSelect).toHaveValue("");
  await expect(strainSelect.locator("option")).toHaveCount(1);
});
