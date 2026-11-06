import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createHarnessOnProjectPage, createProjectAndOpenProjectPage, ingestReviewedLibraryItems,
  putPartRelationship, registerAndSignIn, selectConnectorPickerPart, uniqueToken
} from "./helpers";

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function measure(page: Page) {
  return page.getByTestId("cable-canvas").evaluate(canvas => ({
    top: canvas.getBoundingClientRect().top,
    controlsHeight: document.querySelector('[data-testid="canvas-controls"]')!.getBoundingClientRect().height,
    scrollY: window.scrollY
  }));
}

async function selectWithoutMovingCanvas(page: Page, node: Locator) {
  const before = await measure(page);
  await node.click();
  await expect.poll(async () => Math.abs((await measure(page)).top - before.top)).toBeLessThanOrEqual(1);
  await settleLayout(page);
  const after = await measure(page);
  expect(after.top).toBeCloseTo(before.top, 0);
  expect(after.scrollY - before.scrollY).toBeCloseTo(after.controlsHeight - before.controlsHeight, 0);
  return after.controlsHeight - before.controlsHeight;
}

for (const scenario of [
  { name: "desktop with native anchoring", width: 1440, anchoring: "auto" },
  { name: "desktop without native anchoring", width: 1440, anchoring: "none" },
  { name: "phone", width: 390, anchoring: "auto" }
]) {
  test(`canvas stays in place as selection details expand and contract on ${scenario.name}`, async ({ page, request }) => {
    const token = uniqueToken();
    const framePn = `ANCHOR-${token}-FRAME`, modulePn = `ANCHOR-${token}-MOD`;
    const frameId = `anchor-frame-${token}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await ingestReviewedLibraryItems(request, [
      { id: frameId, category: "frame", partType: "ITA", side: "ITA", partNumber: framePn, family: "Anchor", description: "Six-slot housing", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { moduleCapacity: 6, slotIds: ["A", "B", "C", "D", "E", "F"] } },
      { id: `anchor-module-${token}`, category: "module", partType: "MODULE", side: "ITA", partNumber: modulePn, family: "Anchor", description: "Signal", isActive: true, isReviewed: false, stockStatus: "in_stock", attributes: { pinCount: 2 } }
    ]);
    await putPartRelationship(request, { parentPartId: frameId, compatibleParts: [modulePn], relationshipType: "MODULE_ALLOWED", positionType: "MODULE_SLOT", parentPositions: ["A"], status: "allowed" });
    await registerAndSignIn(page, { username: `anchor-${token}`, email: `anchor-${token}@example.com` });
    await createProjectAndOpenProjectPage(page, `Anchor project ${token}`);
    await createHarnessOnProjectPage(page, `Anchor harness ${token}`);
    await page.getByRole("button", { name: "Add frame", exact: true }).click();
    await page.getByRole("button", { name: "Define Frame", exact: true }).click();
    await page.getByLabel("Search the parts library").fill(framePn);
    await selectConnectorPickerPart(page, framePn, "frame");
    await page.getByRole("button", { name: "Define slot A module", exact: true }).click();
    await selectConnectorPickerPart(page, modulePn, "module");
    await page.getByRole("button", { name: "Add connector", exact: true }).click();
    await page.getByRole("button", { name: "Define Connector", exact: true }).click();
    await page.getByLabel("Search the parts library").fill(modulePn);
    await selectConnectorPickerPart(page, modulePn);

    const canvas = page.getByTestId("cable-canvas");
    const frame = page.getByRole("button", { name: "Frame J1", exact: true });
    const connector = page.getByRole("button", { name: "Connector J2", exact: true });
    // Keep both nodes visible at phone widths as well as on the desktop canvas.
    for (const [index, node] of [frame, connector].entries()) {
      await node.scrollIntoViewIfNeeded();
      const origin = await canvas.boundingBox(), bounds = await node.boundingBox();
      await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
      await page.mouse.down();
      await page.mouse.move(origin!.x + 20 + index * 140 + bounds!.width / 2, origin!.y + 70 + bounds!.height / 2, { steps: 4 });
      await page.mouse.up();
    }
    await connector.click();
    await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.addStyleTag({ content: `html { overflow-anchor: ${scenario.anchoring}; scroll-behavior: smooth; }` });
    await canvas.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().top - 160, behavior: "instant" }));
    await settleLayout(page);

    expect(await selectWithoutMovingCanvas(page, frame)).toBeGreaterThan(40);
    if (scenario.width === 1440) {
      const slot = page.getByRole("article", { name: "Slot A module", exact: true });
      const part = await slot.getByRole("button", { name: "Change slot A module", exact: true }).boundingBox();
      const description = await slot.getByText("Signal").boundingBox();
      const overlap = Math.min(part!.y + part!.height, description!.y + description!.height) - Math.max(part!.y, description!.y);
      expect(overlap).toBeGreaterThan(0);
    }
    // An intentional user scroll becomes the new position to preserve.
    const beforeManualScroll = await measure(page);
    await page.evaluate(() => window.scrollBy({ top: -40, behavior: "instant" }));
    await settleLayout(page);
    expect((await measure(page)).scrollY).toBeCloseTo(beforeManualScroll.scrollY - 40, 0);
    expect(await selectWithoutMovingCanvas(page, connector)).toBeLessThan(-40);

    // At the bottom of the document the browser may clamp scrollY on contraction.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await settleLayout(page);
    expect(await selectWithoutMovingCanvas(page, frame)).toBeGreaterThan(40);
    expect(await selectWithoutMovingCanvas(page, connector)).toBeLessThan(-40);

    const beforeDeselect = await measure(page);
    await canvas.click({ position: { x: 20, y: 20 } });
    await expect(page.getByLabel("Connector name", { exact: true })).toHaveCount(0);
    await expect.poll(async () => Math.abs((await measure(page)).top - beforeDeselect.top)).toBeLessThanOrEqual(1);
  });
}
