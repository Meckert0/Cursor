import { expect, test } from "@playwright/test";
import {
  createProjectAndOpenProjectPage,
  expectHeadingWithRetry,
  openDetailsWithRetry,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("canvas section labels expand on hover and keyboard focus and preserve edited lengths", async ({ page }) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  await registerAndSignIn(page, {
    username: `sections-${token}`,
    email: `sections-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, `Section labels project ${token}`);
  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(`Section labels harness ${token}`);
  await page.getByTestId("create-harness-submit").click();
  await expectHeadingWithRetry(page, "Harness Canvas");
  const canvasUrl = page.url();

  await page.getByRole("button", { name: "Add connector" }).click();
  await page.getByRole("button", { name: "Add connector" }).click();
  const connectors = page.locator('[class*="connectorNode"]');
  await expect(connectors).toHaveCount(2);
  const firstHandle = connectors.first().locator('[class*="connectHandle"]');
  const handleBox = await firstHandle.boundingBox();
  const targetBox = await connectors.nth(1).boundingBox();
  expect(handleBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-cable-section]")).toHaveCount(1);

  const label = page.getByTestId(/^cable-label-/);
  const sectionName = label.getByText("section1", { exact: true });
  const diameter = label.getByText("bundle dia 0 in", { exact: true });
  await expect(label).toHaveCount(1);
  await expect(label).toHaveAccessibleName("section1 - 0 in | no sleeving | bundle dia 0 in");
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await label.innerText()).split("\n").filter(Boolean)).toEqual([
    "0 in",
    "no sleeving"
  ]);
  await expect(sectionName).toBeHidden();
  await expect(diameter).toBeHidden();
  const compactBox = await label.boundingBox();
  expect(compactBox).toBeTruthy();

  await label.hover();
  await expect(sectionName).toBeVisible();
  await expect(diameter).toBeVisible();
  const expandedBox = await label.boundingBox();
  expect(expandedBox).toBeTruthy();
  expect(expandedBox!.height).toBeGreaterThan(compactBox!.height);
  await page.mouse.move(0, 0);
  await expect(sectionName).toBeHidden();
  await expect(diameter).toBeHidden();

  // The section label precedes the connector buttons in the keyboard tab order.
  await connectors.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(label).toBeFocused();
  await expect(sectionName).toBeVisible();
  await expect(diameter).toBeVisible();
  await expect(page.getByLabel("Length (inches)", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(connectors.first()).toBeFocused();
  await expect(sectionName).toBeHidden();
  await expect(diameter).toBeHidden();

  await label.hover();
  const beforeEditBox = await label.boundingBox();
  expect(beforeEditBox).toBeTruthy();
  await label.dblclick();
  const editor = page.getByLabel("Length in inches for section1", { exact: true });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("0");
  const editorBox = await editor.boundingBox();
  expect(editorBox).toBeTruthy();
  expect(editorBox!.x + editorBox!.width / 2).toBeCloseTo(beforeEditBox!.x + beforeEditBox!.width / 2, 0);
  expect(editorBox!.y + editorBox!.height / 2).toBeCloseTo(beforeEditBox!.y + beforeEditBox!.height / 2, 0);
  await editor.fill("24.5");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(label).toHaveAccessibleName("section1 - 24.5 in | no sleeving | bundle dia 0 in");

  await page.getByRole("combobox", { name: /^Sleeving/ }).selectOption("expandable_sleeving");
  const saveStatus = page.getByTestId("canvas-save-status");
  await expect(saveStatus).toContainText(/Unsaved changes|Saving/);
  await expect(saveStatus).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await label.innerText()).split("\n").filter(Boolean)).toEqual([
    "24.5 in",
    "expandable sleeving"
  ]);

  await page.getByRole("button", { name: "Show Details", exact: true }).click();
  const sectionSummary = page.getByRole("listitem").filter({ hasText: /^section1:/ });
  await expect(sectionSummary).toContainText("24.5 in, expandable sleeving, bundle dia 0 in");
  await expect(sectionSummary).toContainText("Expandable sleeving: 875010 (24.5 in)");
  await expect(page.getByRole("list", { name: "Material totals by part number" })).toContainText("Expandable sleeving 875010: 24.5 in");
  await expect(page.getByRole("listitem").filter({ hasText: /^cable1:/ })).toHaveCount(0);
  await openDetailsWithRetry(page);
  await expect(sectionSummary).toContainText("24.5 in, expandable sleeving, bundle dia 0 in");
  await expect(page.getByRole("list", { name: "Material totals by part number" })).toContainText("Expandable sleeving 875010: 24.5 in");

  // Reload without a canvas draft so the saved server snapshot supplies the result.
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("cable-canvas-draft:")) {
        window.localStorage.removeItem(key);
      }
    }
  });
  await page.goto(canvasUrl);
  await expect(label).toHaveAccessibleName("section1 - 24.5 in | expandable sleeving | bundle dia 0 in");
  await page.reload();
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await label.innerText()).split("\n").filter(Boolean)).toEqual([
    "24.5 in",
    "expandable sleeving"
  ]);
  await expect(sectionName).toBeHidden();
  await expect(diameter).toBeHidden();
});
