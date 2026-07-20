import { expect, test } from "@playwright/test";
import {
  apiAsPageUser,
  createProjectHarnessAndOpenDetails,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("submit for quote succeeds after fresh validation", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Quote Project ${token}`;
  const harnessName = `Quote Harness ${token}`;

  await registerAndSignIn(page, {
    username: `quote-${token}`,
    email: `quote-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, { projectName, harnessName });

  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);
  await expect(page.getByText("Summary:", { exact: false })).toBeVisible();

  await page.getByTestId("submit-for-quote-message").fill("Ready for quote.");
  await page.getByTestId("submit-for-quote-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Quote submission received.");
  await expect(page.getByTestId("details-submissions-list")).toContainText("received");
});

test("submit for quote rejects stale validation after snapshot edit", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Stale Quote Project ${token}`;
  const harnessName = `Stale Quote Harness ${token}`;

  await registerAndSignIn(page, {
    username: `staleq-${token}`,
    email: `staleq-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, { projectName, harnessName });

  const detailIdMatch = /\/details\/([0-9a-f-]+)/i.exec(page.url());
  expect(detailIdMatch).toBeTruthy();
  const detailId = detailIdMatch?.[1] ?? "";

  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);

  const revisionResponse = await apiAsPageUser(page, `/v1/revisions/${detailId}`);
  expect(revisionResponse.ok()).toBeTruthy();
  const revision = (await revisionResponse.json()) as { snapshotHash: string };
  expect(revision.snapshotHash).toBeTruthy();

  const patchResponse = await apiAsPageUser(page, `/v1/revisions/${detailId}/snapshot`, {
    method: "PATCH",
    data: {
      expectedSnapshotHash: revision.snapshotHash,
      snapshot: {
        connectors: [{ id: "c-stale", reference: "J-STALE", pins: [{ id: "1", number: "1" }] }],
        junctions: [],
        paths: [],
        pinMappings: [],
        bundles: [],
        annotations: [{ id: "a1", text: "stale-marker" }]
      }
    }
  });
  expect(patchResponse.ok()).toBeTruthy();

  await page.getByTestId("submit-for-quote-submit").click();
  await expect(page.getByTestId("details-page-error")).toContainText(/stale/i);
});
