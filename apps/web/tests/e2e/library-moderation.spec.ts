import { expect, test } from "@playwright/test";
import { registerAndSignIn, uniqueToken } from "./helpers";

test("admin moderation flow: queue filter and bulk approve", async ({ page, request }) => {
  const token = uniqueToken();
  const partNumberApproved = `M22759/16-${(token % 80) + 10}`;
  const partNumberArchived = `MDM-${(token % 90) + 10}P`;

  await registerAndSignIn(page, {
    username: `admin-${token}`,
    email: "meckert@vpc.com"
  });

  const ingestOne = await request.post("http://127.0.0.1:3000/v1/library/components/ingest", {
    headers: {
      "content-type": "application/json",
      "x-role": "editor",
      "x-user-id": `author-${token}`
    },
    data: {
      items: [
        {
          id: `cmp-e2e-admin-${token}-1`,
          category: "wire",
          family: "MIL-W-22759",
          partNumber: partNumberApproved,
          description: "E2E moderation queue item A",
          isActive: true,
          stockStatus: "in_stock",
          isReviewed: false,
          attributes: { awg: "20", color: "white" }
        }
      ]
    }
  });
  expect(ingestOne.ok()).toBeTruthy();

  const ingestTwo = await request.post("http://127.0.0.1:3000/v1/library/components/ingest", {
    headers: {
      "content-type": "application/json",
      "x-role": "editor",
      "x-user-id": `author-${token + 1}`
    },
    data: {
      items: [
        {
          id: `cmp-e2e-admin-${token}-2`,
          category: "contact",
          family: "Micro-D",
          partNumber: partNumberArchived,
          description: "E2E moderation queue item B",
          isActive: true,
          stockStatus: "low_stock",
          isReviewed: false,
          attributes: { acceptedFamilies: [] }
        }
      ]
    }
  });
  expect(ingestTwo.ok()).toBeTruthy();

  await page.goto("/admin/datastores");
  await expect(page.getByRole("heading", { name: "Datastore Admin Console (Phase 7)" })).toBeVisible();
  await expect(page.getByText(partNumberApproved)).toBeVisible();
  await expect(page.getByText(partNumberArchived)).toBeVisible();

  await page.getByLabel("Entered by user").fill(`author-${token}`);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(partNumberApproved)).toBeVisible();
  await expect(page.getByText(partNumberArchived)).not.toBeVisible();

  await page.locator(`input[name="selectedComponentId"][value="cmp-e2e-admin-${token}-1"]`).check();
  await page.getByRole("button", { name: "Bulk approve selected" }).click();
  await expect(page).toHaveURL(/notice=/);
  await page.getByLabel("Entered by user").fill(`author-${token}`);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No pending entries for current filters.")).toBeVisible();
});
