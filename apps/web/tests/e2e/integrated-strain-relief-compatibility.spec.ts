import { expect, test } from "@playwright/test";
import { createHarnessOnProjectPage, createProjectAndOpenProjectPage, getAdminSessionCookie, ingestReviewedLibraryItems, putPartRelationship, registerAndSignIn, selectConnectorPickerPart, uniqueToken } from "./helpers";

test("310123102 receiver with built-in strain relief excludes blank 510160100 in both directions", async ({ page, request, browser, baseURL }) => {
  test.setTimeout(120_000);
  const token = uniqueToken();
  const receiver = "prt-frame-310123102", blank = "prt-module-510160100", signal = "prt-module-510160101", plain = `plain-receiver-${token}`;
  const common = { family: "iCon/i1", isActive: true, isReviewed: false, stockStatus: "in_stock" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: receiver, category: "frame", partType: "RECEIVER", side: "RECEIVER", partNumber: "310123102", family: "iCon EMI", description: "iCon EMI Receiver with protective cover and strain relief", electricalMode: "NONE", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } },
    { ...common, id: plain, category: "frame", partType: "RECEIVER", side: "RECEIVER", partNumber: plain, description: "Receiver without strain relief", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } },
    { ...common, id: blank, category: "module", partType: "MODULE", side: "DUAL", partNumber: "510160100", description: "Blank module, Receiver/ITA, iCon/i1", electricalMode: "NONE", attributes: { positionCount: 0, pinIds: [] } },
    { ...common, id: signal, category: "module", partType: "MODULE", side: "RECEIVER", partNumber: "510160101", description: "Signal module, Receiver, QuadraPaddle", electricalMode: "SELECTABLE", attributes: { positionCount: 1, pinCount: 1, pinIds: ["1"] } }
  ]);
  for (const parentPartId of [receiver, plain]) await putPartRelationship(request, {
    parentPartId, compatibleParts: ["510160100", "510160101"], relationshipType: "MODULE_ALLOWED", parentPositions: ["A", "B"], status: "allowed"
  });
  await putPartRelationship(request, { parentPartId: blank, compatibleParts: ["310123102", plain], relationshipType: "MATES_WITH", parentPositions: [], status: "allowed" });
  const adminCookie = await getAdminSessionCookie(request);
  const headers = { cookie: adminCookie };
  const response = await request.get("http://127.0.0.1:3000/v1/library/relationships", { headers });
  expect(response.ok()).toBeTruthy();
  const rules = (await response.json()).items as Array<{ parentPartId: string; targetPartIds: string[] }>;
  expect(rules.find(row => row.parentPartId === receiver)?.targetPartIds).toEqual([signal]);
  expect(rules.find(row => row.parentPartId === blank)?.targetPartIds).toEqual([plain]);
  expect(rules.find(row => row.parentPartId === plain)?.targetPartIds.sort()).toEqual([blank, signal].sort());
  for (const [parentPartId, targetPartId] of [[receiver, blank], [blank, receiver]]) {
    const invalid = await request.put("http://127.0.0.1:3000/v1/library/relationships", { headers, data: {
      parentPartId, targetPartIds: [targetPartId], relationshipType: "MATES_WITH", parentPositions: [], status: "allowed"
    } });
    expect(invalid.status()).toBe(400);
    expect(await invalid.text()).toContain("COMPATIBILITY_BLANK_MODULE_STRAIN_RELIEF");
  }

  const adminContext = await browser.newContext({ baseURL });
  try {
    await adminContext.addCookies([{ name: "cdt_session", value: adminCookie.slice("cdt_session=".length), url: baseURL! }]);
    const adminPage = await adminContext.newPage();
    for (const [partNumber, excluded] of [["310123102", "510160100"], ["510160100", "310123102"]]) {
      await adminPage.goto(`/admin?databaseTab=compatibility&q=${partNumber}`);
      const row = adminPage.getByRole("tabpanel", { name: "Compatibility & Aliases", exact: true }).getByRole("row")
        .filter({ has: adminPage.getByRole("cell", { name: partNumber, exact: true }) });
      await expect(row).toHaveCount(1);
      await expect(row).not.toContainText(excluded);
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(adminPage.getByRole("textbox", { name: "Compatible parts", exact: true })).not.toHaveValue(new RegExp(excluded));
      if (partNumber === "310123102") await expect(row).toContainText("510160101");
    }
    await adminPage.goto(`/library/${receiver}`);
    await expect(adminPage.getByRole("heading", { name: "Compatibility", exact: true }).locator("..")).not.toContainText("510160100");
    await adminPage.goto(`/library/${blank}`);
    await expect(adminPage.getByRole("heading", { name: "Compatibility", exact: true }).locator("..")).not.toContainText("310123102");
  } finally { await adminContext.close(); }

  await registerAndSignIn(page, { username: `integrated-${token}`, email: `integrated-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `Integrated relief ${token}`);
  await createHarnessOnProjectPage(page, `Integrated relief ${token}`);
  await page.getByRole("button", { name: "Add frame", exact: true }).click();
  await page.getByRole("button", { name: "Define Frame", exact: true }).click();
  await page.getByLabel("Search the parts library").fill("310123102");
  await selectConnectorPickerPart(page, "310123102", "frame");
  await page.getByRole("button", { name: "Define slot A module", exact: true }).click();
  await page.getByLabel("Search the parts library").fill("510160100");
  await expect(page.getByRole("radio", { name: "Preview 510160100", exact: true })).toHaveCount(0);
  await page.getByLabel("Search the parts library").fill("510160101");
  await selectConnectorPickerPart(page, "510160101", "module");
  await expect(page.getByRole("button", { name: "Change slot A module", exact: true })).toContainText("510160101");
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
});
