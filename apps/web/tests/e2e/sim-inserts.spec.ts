import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import XLSX from "xlsx";
import { apiAsPageUser, createHarnessOnProjectPage, createProjectAndOpenProjectPage, ingestReviewedLibraryItems, putPartRelationship, registerAndSignIn, selectConnectorPickerPart, uniqueToken } from "./helpers";

test("legacy SIM host pins normalize without deleting saved wirelist rows or mappings", async ({ page, request }) => {
  const token = uniqueToken(), host = `LEGACY-SIM-${token}`;
  await ingestReviewedLibraryItems(request, [{ id: host, category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", family: host, partNumber: host, description: "Legacy SIM host", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { pinCount: 2, pinIds: ["1", "2"], simSlotCount: 2, simSlotSections: [["1", "2"]] } }]);
  await registerAndSignIn(page, { username: `legacy-sim-${token}`, email: `legacy-sim-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `Legacy SIM ${token}`);
  // Seed an existing design before its first canvas visit, with no unrelated local draft.
  const projectId = /\/projects\/([^/]+)/.exec(page.url())![1];
  const harnessResponse = await apiAsPageUser(page, `/v1/projects/${projectId}/harnesses`, { method: "POST", data: { name: `Legacy SIM harness ${token}`, createdBy: "legacy-sim-test" } });
  expect(harnessResponse.ok()).toBeTruthy();
  const harness = await harnessResponse.json();
  const harnessId = harness.id as string, revisionId = harness.currentRevisionId as string;
  const initialResponse = await apiAsPageUser(page, `/v1/revisions/${revisionId}`);
  const initial = await initialResponse.json();
  const patch = await apiAsPageUser(page, `/v1/revisions/${revisionId}/snapshot`, { method: "PATCH", data: {
    expectedSnapshotHash: initial.snapshotHash,
    snapshot: { ...initial.snapshot, connectors: [
      { id: "legacy-root", reference: "J1", partNumber: host, libraryComponentId: host, pins: [{ id: "1", number: "1" }] },
      { id: "legacy-frame", reference: "J2", partNumber: "FRAME", pins: [{ id: "A:1", number: "1" }], slots: [
        { slotId: "A", reference: "J2A", partNumber: host, libraryComponentId: host, pins: [{ id: "1", number: "1" }] }, { slotId: "B", reference: "J2B", pins: [] }
      ] }
    ], paths: [{ id: "legacy-wire", fromConnectorId: "legacy-root", toConnectorId: "legacy-frame", pathType: "wire", wirelistManaged: true, fromLocation: "J1 - 1", toLocation: "J2A - 1" }], pinMappings: [{ id: "legacy-mapping", pathId: "legacy-wire", fromConnectorId: "legacy-root", fromPinId: "1", toConnectorId: "legacy-frame", toPinId: "A:1", mappingType: "one_to_one" }] }
  } });
  expect(patch.ok()).toBeTruthy();
  await page.goto(`/harnesses/${harnessId}/canvas`);
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at/, { timeout: 20_000 });
  const response = await apiAsPageUser(page, `/v1/revisions/${revisionId}`);
  const revision = await response.json();
  expect(revision.snapshot.connectors[0].simInserts).toEqual([]);
  expect(revision.snapshot.connectors[0].pins).toEqual([]);
  expect(revision.snapshot.connectors[1].slots[0].simInserts).toEqual([]);
  expect(revision.snapshot.connectors[1].pins).toEqual([]);
  expect(revision.snapshot.paths[0].fromLocation).toBe("J1 - 1");
  expect(revision.snapshot.paths[0].toLocation).toBe("J2A - 1");
  expect(revision.snapshot.pinMappings[0].fromPinId).toBe("1");
  expect(revision.snapshot.pinMappings[0].toPinId).toBe("A:1");
});

test("SIM modules configure nested inserts, preserve wiring, and count physical inserts across frame and standalone modules", async ({ page, request }) => {
  test.setTimeout(180_000);
  const token = uniqueToken(), prefix = `SIM-${token}`;
  const frame = `${prefix}-FRAME`, host = `${prefix}-HOST`, small = `${prefix}-SMALL`, pair = `${prefix}-PAIR`, single = `${prefix}-SINGLE`, wrong = `${prefix}-WRONG`, forbidden = `${prefix}-FORBIDDEN`;
  const common = { family: prefix, isActive: true, isReviewed: false, stockStatus: "in_stock", side: "ITA" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: frame, category: "frame", partType: "ITA", partNumber: frame, description: "ITA housing", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } },
    { ...common, id: host, category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: host, description: "Four-slot SIM module", attributes: { pinCount: 128, simSlotCount: 4, simSlotSections: [["1", "2"], ["3", "4"]] } },
    { ...common, id: small, category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: small, description: "Two-slot SIM module", attributes: { pinCount: 64, simSlotCount: 2, simSlotSections: [["1", "2"]] } },
    { ...common, id: pair, category: "module", partType: "SIM_INSERT", partNumber: pair, description: "Two-slot insert", attributes: { pinCount: 2, pinIds: ["P", "N"], slotOccupancy: 2 } },
    { ...common, id: single, category: "module", partType: "SIM_INSERT", partNumber: single, description: "One-slot insert", attributes: { pinCount: 1, pinIds: ["S"], slotOccupancy: 1 } },
    { ...common, id: wrong, category: "module", partType: "SIM_INSERT", side: "RECEIVER", partNumber: wrong, description: "Wrong side", attributes: { pinCount: 1, slotOccupancy: 1 } },
    { ...common, id: forbidden, category: "module", partType: "SIM_INSERT", partNumber: forbidden, description: "Forbidden insert", attributes: { pinCount: 1, slotOccupancy: 1 } }
  ]);
  await putPartRelationship(request, { parentPartId: frame, compatibleParts: [host, small], relationshipType: "MODULE_ALLOWED", positionType: "MODULE_SLOT", parentPositions: ["A", "B"], status: "allowed" });
  await putPartRelationship(request, { parentPartId: host, compatibleParts: [pair, single, wrong, forbidden], relationshipType: "INSERT_ALLOWED", positionType: "SIM_SLOT", parentPositions: [], status: "allowed" });
  await putPartRelationship(request, { parentPartId: host, compatibleParts: [forbidden], relationshipType: "INSERT_ALLOWED", positionType: "SIM_SLOT", parentPositions: ["1", "2", "3", "4"], status: "forbidden" });
  await putPartRelationship(request, { parentPartId: small, compatibleParts: [pair], relationshipType: "INSERT_ALLOWED", positionType: "SIM_SLOT", parentPositions: ["1", "2"], status: "allowed" });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await registerAndSignIn(page, { username: `sim-${token}`, email: `sim-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `SIM project ${token}`);
  await createHarnessOnProjectPage(page, `SIM harness ${token}`);
  const canvasUrl = page.url();
  const harnessId = /\/harnesses\/([^/]+)/.exec(canvasUrl)![1];
  const harnessResponse = await apiAsPageUser(page, `/v1/harnesses/${harnessId}`);
  const revisionId = (await harnessResponse.json()).currentRevisionId as string;
  const saved = async () => { await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 }); };
  const loadRevision = async () => {
    const response = await apiAsPageUser(page, `/v1/revisions/${revisionId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const moduleDialog = (reference: string) => page.getByRole("dialog", { name: `${reference} · SIM inserts`, exact: true });
  const selectSlot = async (reference: string, slot: string) => {
    await moduleDialog(reference).getByRole("button", { name: `${reference} SIM slot ${slot}`, exact: true }).click();
  };
  const chooseInsert = async (reference: string, slot: string, pn: string) => {
    await selectSlot(reference, slot);
    await page.getByRole("button", { name: `Select SIM insert ${slot} for ${reference}`, exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Select SIM insert", exact: true });
    await expect(picker.getByRole("radio", { name: `Preview ${host}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${frame}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${wrong}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${forbidden}`, exact: true })).toHaveCount(0);
    await selectConnectorPickerPart(page, pn, "SIM insert");
    await expect(moduleDialog(reference)).toBeVisible();
    await expect(moduleDialog(reference).getByRole("button", { name: `Change SIM insert ${slot} for ${reference}`, exact: true })).toBeFocused();
  };

  await page.getByRole("button", { name: "Add frame", exact: true }).click();
  await page.getByRole("button", { name: "Define Frame", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(prefix);
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(1);
  await selectConnectorPickerPart(page, frame, "frame");
  await page.getByRole("button", { name: "Define slot A module", exact: true }).click();
  await expect(page.getByRole("radio", { name: `Preview ${pair}`, exact: true })).toHaveCount(0);
  await selectConnectorPickerPart(page, host, "module");
  const framePreview = await page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true }).boundingBox();
  const frameBackshell = await page.getByRole("combobox", { name: "Slot A backshell", exact: true }).boundingBox();
  expect(framePreview!.x + framePreview!.width).toBeLessThan(frameBackshell!.x);
  expect(frameBackshell!.x - framePreview!.x - framePreview!.width).toBeLessThanOrEqual(28);
  expect(frameBackshell!.width).toBeGreaterThanOrEqual(160);
  expect(framePreview!.y).toBeLessThan(frameBackshell!.y + frameBackshell!.height);
  expect(framePreview!.y + framePreview!.height).toBeGreaterThan(frameBackshell!.y);
  const frameControlsBefore = await page.getByTestId("canvas-controls").boundingBox();
  const canvasBefore = await page.getByTestId("cable-canvas").boundingBox();
  await page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true }).click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+z");
  await expect(moduleDialog("J1A")).toBeVisible();
  await expect(moduleDialog("J1A").getByRole("group", { name: "SIM section 1", exact: true }).getByRole("button")).toHaveCount(2);
  await expect(moduleDialog("J1A").getByRole("group", { name: "SIM section 2", exact: true }).getByRole("button")).toHaveCount(2);
  await chooseInsert("J1A", "1", pair);
  await selectSlot("J1A", "2");
  await expect(moduleDialog("J1A").getByRole("region", { name: "Selected SIM slot" })).toContainText(pair);
  await expect(moduleDialog("J1A").getByRole("heading", { name: "Slots 1, 2", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select SIM insert 2 for J1A", exact: true })).toHaveCount(0);
  await chooseInsert("J1A", "3", single);
  await chooseInsert("J1A", "4", single);
  await expect(moduleDialog("J1A").getByRole("status")).toContainText("4/4 filled");
  await selectSlot("J1A", "1");
  await page.getByRole("button", { name: "Remove SIM insert 1 for J1A", exact: true }).click();
  await selectSlot("J1A", "2");
  await page.getByRole("button", { name: "Select SIM insert 2 for J1A", exact: true }).click();
  await expect(page.getByRole("radio", { name: `Preview ${pair}`, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Select SIM insert", exact: true })).toHaveCount(0);
  await expect(moduleDialog("J1A")).toBeVisible();
  await expect(moduleDialog("J1A").getByRole("button", { name: "Select SIM insert 2 for J1A", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await moduleDialog("J1A").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toContainText("4/4 filled");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select SIM insert 1 for J1A", exact: true })).toBeVisible();
  await chooseInsert("J1A", "1", pair);
  await saved();
  await moduleDialog("J1A").screenshot({ path: test.info().outputPath("sim-frame-module-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(moduleDialog("J1A")).toHaveCount(0);
  const frameControlsAfter = await page.getByTestId("canvas-controls").boundingBox();
  const canvasAfter = await page.getByTestId("cable-canvas").boundingBox();
  expect(Math.abs(frameControlsAfter!.height - frameControlsBefore!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvasAfter!.y - canvasBefore!.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toBeFocused();
  await page.getByTestId("canvas-controls").screenshot({ path: test.info().outputPath("sim-frame-controls.png") });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Frame J1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toContainText("4/4 filled");

  await page.getByRole("button", { name: "Add connector", exact: true }).click();
  await page.getByRole("button", { name: "Define Connector", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(prefix);
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(2);
  await selectConnectorPickerPart(page, host);
  const standalonePreview = await page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true }).boundingBox();
  const standaloneBackshell = await page.getByRole("combobox", { name: "Backshell", exact: true }).boundingBox();
  expect(standalonePreview!.x + standalonePreview!.width).toBeLessThan(standaloneBackshell!.x);
  expect(standaloneBackshell!.x - standalonePreview!.x - standalonePreview!.width).toBeLessThanOrEqual(28);
  expect(standaloneBackshell!.width).toBeGreaterThanOrEqual(160);
  expect(standalonePreview!.y).toBeLessThan(standaloneBackshell!.y + standaloneBackshell!.height);
  await page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true }).click();
  await chooseInsert("J2", "1", pair);
  await chooseInsert("J2", "3", single);
  await chooseInsert("J2", "4", single);
  await saved();
  await moduleDialog("J2").getByRole("button", { name: "Done", exact: true }).click();
  const revision = await loadRevision();
  expect(revision.snapshot.connectors.find((item: { id: string; reference: string }) => item.reference === "J2").pins.map((pin: { id: string }) => pin.id).sort()).toEqual(["1:N", "1:P", "3:S", "4:S"]);
  expect(revision.snapshot.connectors.find((item: { reference: string }) => item.reference === "J1").slots[0].simInserts).toHaveLength(3);
  const bomResponse = await apiAsPageUser(page, `/v1/revisions/${revisionId}/bom`);
  const bom = await bomResponse.json();
  expect(bom.lines.find((line: { partNumber: string }) => line.partNumber === pair).quantity).toBe(2);
  expect(bom.lines.find((line: { partNumber: string }) => line.partNumber === single).quantity).toBe(4);
  const validateResponse = await apiAsPageUser(page, `/v1/revisions/${revisionId}/validate`, { method: "POST", data: { mode: "full" } });
  expect(validateResponse.ok()).toBeTruthy();
  expect((await validateResponse.json()).results.filter((issue: { code: string }) => issue.code.startsWith("RULE_SIM_"))).toEqual([]);

  await page.getByRole("link", { name: "Wirelist", exact: true }).click();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Run #", "From Location (Conn - Pin)", "From Contact", "From Signal Desc", "Wire AWG", "Wire/Patchcord P/N", "Length (in)", "Wire Color", "Wire Group", "To Location (Conn-Pin)", "To Contact", "To Signal Desc", "Label P/N", "Label Text", "Notes"],
    [1, "J1A - 1/P", "", "", "22", "", 12, "white", "", "J2 - 1/P", "", "", "", "", "SIM wiring"]
  ]), "Wirelist");
  const filePath = test.info().outputPath("sim-wirelist.xlsx");
  await writeFile(filePath, XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
  await page.getByTestId("wirelist-import-input").setInputFiles(filePath);
  await expect(page.getByText("Wirelist imported and saved.")).toBeVisible();
  const wired = await loadRevision();
  expect(wired.snapshot.pinMappings[0].fromPinId).toBe("A:1:P");
  expect(wired.snapshot.pinMappings[0].toPinId).toBe("1:P");

  await page.goto(canvasUrl);
  await page.getByRole("button", { name: "Connector J2", exact: true }).click();
  await page.getByRole("button", { name: "Change connector", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(small);
  await selectConnectorPickerPart(page, small);
  await page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true }).click();
  await expect(moduleDialog("J2").getByRole("status")).toContainText("2 need attention");
  await expect(moduleDialog("J2").getByRole("region", { name: "Selected SIM slot" })).toContainText(pair);
  await page.getByRole("button", { name: "Remove SIM insert 3 for J2", exact: true }).click();
  await page.getByRole("button", { name: "Remove SIM insert 4 for J2", exact: true }).click();
  await expect(moduleDialog("J2").getByRole("status")).toContainText("2/2 filled");
  await saved();
  const changed = await loadRevision();
  expect(changed.snapshot.paths.find((path: { notes?: string }) => path.notes === "SIM wiring").fromLocation).toBe("J1A - 1/P");
  expect(changed.snapshot.pinMappings[0].toPinId).toBe("1:P");
  await page.setViewportSize({ width: 390, height: 960 });
  await moduleDialog("J2").screenshot({ path: test.info().outputPath("sim-mobile-module-dialog.png") });
  const mobileDialog = await moduleDialog("J2").boundingBox();
  expect(mobileDialog!.x).toBeGreaterThanOrEqual(0);
  expect(mobileDialog!.x + mobileDialog!.width).toBeLessThanOrEqual(390);
  await expect(moduleDialog("J2").getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  await moduleDialog("J2").getByRole("button", { name: "Done", exact: true }).click();
  await page.getByTestId("canvas-controls").screenshot({ path: test.info().outputPath("sim-mobile-controls.png") });
  await page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true }).click();
  await page.getByRole("button", { name: "Change SIM insert 1 for J2", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Select SIM insert", exact: true }).getByRole("radio")).toHaveCount(1);
  await selectConnectorPickerPart(page, pair, "SIM insert");
  await expect(moduleDialog("J2").getByRole("button", { name: "Change SIM insert 1 for J2", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(moduleDialog("J2")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true })).toBeFocused();
});

test("iSeries SIM faces share drawing proportions and bank order in the preview and editor", async ({ page, request }) => {
  const token = uniqueToken(), frame = `VPC-FRAME-${token}`, icon = `VPC-ICON-${token}`, i2mx = `VPC-I2MX-${token}`, pair = `VPC-PAIR-${token}`;
  const common = { family: `VPC-SIM-${token}`, isActive: true, isReviewed: false, stockStatus: "in_stock", side: "ITA" };
  await ingestReviewedLibraryItems(request, [
    { ...common, id: frame, category: "frame", partType: "ITA", partNumber: frame, description: "Two-module housing", attributes: { moduleCapacity: 2, slotIds: ["A", "B"] } },
    { ...common, id: icon, category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: "510161130", description: "iCon SIM module, 16 slots", attributes: { simSlotCount: 16 } },
    { ...common, id: i2mx, category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: "510144001", description: "i2 MX SIM adapter rails, 11 slots", attributes: { simSlotCount: 11 } },
    { ...common, id: pair, category: "module", partType: "SIM_INSERT", partNumber: pair, description: "Two-slot insert", attributes: { slotOccupancy: 2, pinIds: ["P", "N"] } }
  ]);
  for (const hostId of [icon, i2mx]) await putPartRelationship(request, { parentPartId: hostId, compatibleParts: [pair], relationshipType: "INSERT_ALLOWED", positionType: "SIM_SLOT", parentPositions: [], status: "allowed" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await registerAndSignIn(page, { username: `vpc-sim-${token}`, email: `vpc-sim-${token}@example.com` });
  await createProjectAndOpenProjectPage(page, `VPC SIM layout ${token}`);
  const projectId = /\/projects\/([^/]+)/.exec(page.url())![1];
  const harnessResponse = await apiAsPageUser(page, `/v1/projects/${projectId}/harnesses`, { method: "POST", data: { name: `VPC SIM ${token}`, createdBy: "vpc-sim-test" } });
  expect(harnessResponse.ok()).toBeTruthy();
  const harness = await harnessResponse.json();
  const revisionResponse = await apiAsPageUser(page, `/v1/revisions/${harness.currentRevisionId}`);
  const revision = await revisionResponse.json();
  const seed = await apiAsPageUser(page, `/v1/revisions/${harness.currentRevisionId}/snapshot`, { method: "PATCH", data: {
    expectedSnapshotHash: revision.snapshotHash,
    snapshot: { ...revision.snapshot, connectors: [
      { id: "vpc-frame", reference: "J1", partNumber: frame, libraryComponentId: frame, pins: [], slots: [
        { slotId: "A", reference: "J1A", partNumber: "510161130", libraryComponentId: icon, pins: [], simInserts: [] },
        { slotId: "B", reference: "J1B", partNumber: "510144001", libraryComponentId: i2mx, pins: [], simInserts: [] }
      ] },
      { id: "vpc-standalone", reference: "J2", partNumber: "510161130", libraryComponentId: icon, pins: [], simInserts: [] }
    ] }
  } });
  expect(seed.ok()).toBeTruthy();
  await page.goto(`/harnesses/${harness.id}/canvas`);
  await page.getByRole("button", { name: "Frame J1", exact: true }).click();
  await page.getByTestId("canvas-controls").screenshot({ path: test.info().outputPath("vpc-sim-frame-previews.png") });
  for (const [reference, count, width, height, pn, bankSizes] of [["J1A", 16, 30.22, 56.13, "510161130", [8, 8]], ["J1B", 11, 50, 16, "510144001", [5, 5, 1]]] as const) {
    const preview = page.getByRole("button", { name: `Configure SIM inserts for ${reference}`, exact: true });
    await expect(preview.getByRole("img")).toHaveAttribute("viewBox", `0 0 ${width} ${height}`);
    await preview.click();
    const dialog = page.getByRole("dialog", { name: `${reference} · SIM inserts`, exact: true });
    const face = dialog.locator(`svg[viewBox="0 0 ${width} ${height}"]`);
    await expect(face).toBeVisible();
    const bounds = await face.boundingBox();
    expect(bounds!.width / bounds!.height).toBeCloseTo(width / height, 1);
    const slotName = (id: number) => `${reference} SIM slot ${id}${pn === "510161130" ? ` (${id <= 8 ? "A" : "B"}${(id - 1) % 8 + 1})` : ""}`;
    if (pn === "510161130") {
      const a1 = await dialog.getByRole("button", { name: slotName(1), exact: true }).boundingBox();
      const a8 = await dialog.getByRole("button", { name: slotName(8), exact: true }).boundingBox();
      const b1 = await dialog.getByRole("button", { name: slotName(9), exact: true }).boundingBox();
      expect(a1!.x).toBeGreaterThan(a8!.x);
      expect(a1!.y).toBeLessThan(b1!.y);
      expect(bounds!.height).toBeGreaterThan(bounds!.width);
    }
    for (const [bank, size] of bankSizes.entries()) await expect(dialog.getByRole("group", { name: `SIM section ${bank + 1}`, exact: true }).getByRole("button")).toHaveCount(size);
    await expect(dialog.getByRole("link", { name: "VPC drawing ↗", exact: true })).toHaveAttribute("href", `https://www.vpc.com/resources/files/${pn}-pdf/`);
    await dialog.getByRole("button", { name: slotName(bankSizes[0]), exact: true }).click();
    await dialog.getByRole("button", { name: `Select SIM insert ${bankSizes[0]} for ${reference}`, exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Select SIM insert", exact: true });
    await expect(picker.getByRole("radio", { name: `Preview ${pair}`, exact: true })).toHaveCount(0);
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.getByRole("button", { name: slotName(bankSizes[0] + 1), exact: true }).click();
    await dialog.getByRole("button", { name: `Select SIM insert ${bankSizes[0] + 1} for ${reference}`, exact: true }).click();
    await selectConnectorPickerPart(page, pair, "SIM insert");
    await expect(dialog.getByRole("status")).toContainText(`2/${count} filled`);
    await dialog.screenshot({ path: test.info().outputPath(`vpc-sim-${count}-editor.png`) });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(preview).toBeFocused();
  }
  await page.getByRole("button", { name: "Connector J2", exact: true }).click();
  await page.getByTestId("canvas-controls").screenshot({ path: test.info().outputPath("vpc-sim-standalone-preview.png") });
  await page.setViewportSize({ width: 390, height: 960 });
  const preview = page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true });
  await preview.click();
  const dialog = page.getByRole("dialog", { name: "J2 · SIM inserts", exact: true });
  await dialog.getByRole("button", { name: "J2 SIM slot 16 (B8)", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Slot B8", exact: true })).toBeVisible();
  await expect(dialog.getByText("Slot ID 16", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.screenshot({ path: test.info().outputPath("vpc-sim-mobile-editor.png") });
  await page.keyboard.press("Escape");
  await expect(preview).toBeFocused();
});
