import { expect, test } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  ingestReviewedLibraryItems,
  openDetailsWithRetry,
  putPartRelationship,
  registerAndSignIn,
  selectConnectorPickerPart,
  uniqueToken
} from "./helpers";

test("connector positions form one A1–D40 range in Details, Canvas, and Wirelist", async ({ page, request }) => {
  test.setTimeout(180_000);
  const token = uniqueToken();
  const moduleId = `range-module-${token}`;
  const modulePartNumber = `RANGE-MOD-${token}`;
  const contactPartNumber = `RANGE-CNT-${token}`;
  const positions = ["A", "B", "C", "D"].flatMap((letter) =>
    Array.from({ length: 40 }, (_, index) => `${letter}${index + 1}`)
  );
  const common = {
    family: "iCon",
    isActive: true,
    isReviewed: false,
    stockStatus: "in_stock"
  };
  await ingestReviewedLibraryItems(request, [
    {
      ...common,
      id: moduleId,
      category: "module",
      partNumber: modulePartNumber,
      description: "160-position range module",
      partType: "MODULE",
      side: "ITA",
      attributes: { pinCount: 160, pinIds: positions, contactFamily1: "TP", gender: "ITA" }
    },
    {
      ...common,
      id: `range-contact-${token}`,
      category: "contact",
      partNumber: contactPartNumber,
      description: "Range contact",
      attributes: { acceptedAwgMin: 22, acceptedAwgMax: 26 }
    }
  ]);
  await putPartRelationship(request, {
    parentPartId: moduleId,
    compatibleParts: [contactPartNumber],
    relationshipType: "CONTACT_ALLOWED",
    positionType: "CONTACT_POSITION",
    parentPositions: positions,
    status: "allowed"
  });
  await registerAndSignIn(page, {
    username: `ranges-${token}`,
    email: `ranges-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, `Range project ${token}`);
  await createHarnessOnProjectPage(page, `Range harness ${token}`);
  const canvasUrl = page.url();

  await page.getByRole("button", { name: "Add connector" }).click();
  await page.locator('[class*="connectorNode"]').first().click();
  await page.getByRole("button", { name: "Define Connector" }).click();
  await page.getByPlaceholder("Search connectors...").fill(modulePartNumber);
  await selectConnectorPickerPart(page, modulePartNumber, "connector");
  await expect(page.getByTestId("canvas-save-status")).toContainText(/Saved at|All changes saved/, { timeout: 20_000 });

  await page.getByRole("button", { name: "Show Details" }).click();
  await expect(page.getByRole("table", { name: "Compatible contacts for J1" })
    .getByRole("cell", { name: "A1–D40", exact: true })).toBeVisible();

  await openDetailsWithRetry(page);
  await expect(page.getByRole("table", { name: "Compatible contacts for J1" })
    .getByRole("cell", { name: "A1–D40", exact: true })).toBeVisible();

  await page.goto(canvasUrl.replace(/\/canvas$/, "/wirelist"));
  await expect(page.getByRole("heading", { name: "Wirelist" })).toBeVisible();
  await page.getByRole("button", { name: "Show Details" }).click();
  await expect(page.getByRole("table", { name: "Compatible contacts for J1" })
    .getByRole("cell", { name: "A1–D40", exact: true })).toBeVisible();
});
