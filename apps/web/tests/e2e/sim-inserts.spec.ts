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
  const chooseInsert = async (reference: string, slot: string, pn: string) => {
    await page.getByRole("button", { name: `Select SIM insert ${slot} for ${reference}`, exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Select SIM insert", exact: true });
    await expect(picker.getByRole("radio", { name: `Preview ${host}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${frame}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${wrong}`, exact: true })).toHaveCount(0);
    await expect(picker.getByRole("radio", { name: `Preview ${forbidden}`, exact: true })).toHaveCount(0);
    await selectConnectorPickerPart(page, pn, "SIM insert");
  };

  await page.getByRole("button", { name: "Add frame", exact: true }).click();
  await page.getByRole("button", { name: "Define Frame", exact: true }).click();
  await page.getByLabel("Search the parts library").fill(prefix);
  await expect(page.getByRole("dialog").getByRole("radio")).toHaveCount(1);
  await selectConnectorPickerPart(page, frame, "frame");
  await page.getByRole("button", { name: "Define slot A module", exact: true }).click();
  await expect(page.getByRole("radio", { name: `Preview ${pair}`, exact: true })).toHaveCount(0);
  await selectConnectorPickerPart(page, host, "module");
  await page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true }).click();
  await chooseInsert("J1A", "1", pair);
  await expect(page.getByRole("group", { name: "J1A SIM slot 2", exact: true })).toContainText(`Occupied by ${pair}`);
  await expect(page.getByRole("button", { name: "Select SIM insert 2 for J1A", exact: true })).toHaveCount(0);
  await chooseInsert("J1A", "3", single);
  await chooseInsert("J1A", "4", single);
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toContainText("4/4 filled");
  await page.getByRole("button", { name: "Remove SIM insert 1 for J1A", exact: true }).click();
  await page.getByRole("button", { name: "Select SIM insert 2 for J1A", exact: true }).click();
  await expect(page.getByRole("radio", { name: `Preview ${pair}`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J1A", exact: true })).toContainText("4/4 filled");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Select SIM insert 1 for J1A", exact: true })).toBeVisible();
  await chooseInsert("J1A", "1", pair);
  await saved();
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
  await page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true }).click();
  await chooseInsert("J2", "1", pair);
  await chooseInsert("J2", "3", single);
  await chooseInsert("J2", "4", single);
  await saved();
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
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true })).toContainText("2 need attention");
  await expect(page.getByRole("button", { name: "Change SIM insert 1 for J2", exact: true })).toContainText(pair);
  await page.getByRole("button", { name: "Remove SIM insert 3 for J2", exact: true }).click();
  await page.getByRole("button", { name: "Remove SIM insert 4 for J2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure SIM inserts for J2", exact: true })).toContainText("2/2 filled");
  await saved();
  const changed = await loadRevision();
  expect(changed.snapshot.paths.find((path: { notes?: string }) => path.notes === "SIM wiring").fromLocation).toBe("J1A - 1/P");
  expect(changed.snapshot.pinMappings[0].toPinId).toBe("1:P");
  await page.setViewportSize({ width: 390, height: 960 });
  await page.getByTestId("canvas-controls").screenshot({ path: test.info().outputPath("sim-mobile-controls.png") });
  await page.getByRole("button", { name: "Change SIM insert 1 for J2", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Select SIM insert", exact: true }).getByRole("radio")).toHaveCount(1);
  await selectConnectorPickerPart(page, pair, "SIM insert");
});
