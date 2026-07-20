import { expect, test } from "@playwright/test";
import {
  createProjectHarnessAndOpenDetails,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("validate then export and download", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Export Project ${token}`;
  const harnessName = `Export Harness ${token}`;

  await registerAndSignIn(page, {
    username: `export-${token}`,
    email: `export-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, { projectName, harnessName });

  await expect(page.getByTestId("details-bom-section")).toBeVisible();
  await page.getByTestId("run-validation-submit").click();
  await expect(page).toHaveURL(/validationRunId=/);
  await expect(page.getByText("Summary:", { exact: false })).toBeVisible();

  await page.getByTestId("create-json-export-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Export queued.");
  await expect(page.getByTestId("details-export-list")).toContainText("json", { timeout: 30_000 });
  await expect(page.getByTestId("details-export-list")).toContainText("completed", { timeout: 30_000 });
  await expect(page.getByTestId("export-download-link")).toBeVisible({ timeout: 30_000 });
});
