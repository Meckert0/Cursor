import { expect, test } from "@playwright/test";
import {
  API_BASE_URL,
  apiAsPageUser,
  createProjectHarnessAndOpenDetails,
  registerAndSignIn,
  registerUserViaApi,
  uniqueToken
} from "./helpers";

test("lock contention surfaces conflict to second editor", async ({ page, request }) => {
  const token = uniqueToken();
  const projectName = `Lock Project ${token}`;
  const harnessName = `Lock Harness ${token}`;

  await registerAndSignIn(page, {
    username: `locka-${token}`,
    email: `locka-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, { projectName, harnessName });

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)/i.exec(
    (await page.getByRole("link", { name: "Back to canvas" }).getAttribute("href")) ?? ""
  );
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";

  const projectIdResponse = await apiAsPageUser(page, `/v1/harnesses/${harnessId}`);
  expect(projectIdResponse.ok()).toBeTruthy();
  const harness = (await projectIdResponse.json()) as { projectId: string };

  const userB = await registerUserViaApi(request, {
    username: `lockb-${token}`,
    email: `lockb-${token}@example.com`
  });

  const memberResponse = await apiAsPageUser(page, `/v1/projects/${harness.projectId}/members/${userB.user.id}`, {
    method: "PUT",
    data: { role: "editor" }
  });
  expect(memberResponse.ok()).toBeTruthy();

  await page.getByTestId("lock-harness-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Harness locked for editing.");

  const conflict = await request.post(`${API_BASE_URL}/v1/harnesses/${harnessId}/lock`, {
    headers: {
      cookie: `cdt_session=${userB.sessionToken}`,
      "content-type": "application/json"
    },
    data: { ttlSeconds: 300 },
    failOnStatusCode: false
  });
  expect(conflict.status()).toBe(409);
  const conflictBody = await conflict.json();
  expect(String(conflictBody.message ?? "")).toMatch(/locked by another user/i);

  await page.getByTestId("unlock-harness-submit").click();
  await expect(page.getByTestId("details-page-notice")).toContainText("Harness unlocked.");
});

test("export failure status and error message are surfaced on details", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Fail Export Project ${token}`;
  const harnessName = `Fail Export Harness ${token}`;

  await registerAndSignIn(page, {
    username: `failex-${token}`,
    email: `failex-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, { projectName, harnessName });

  const detailIdMatch = /\/details\/([0-9a-f-]+)/i.exec(page.url());
  expect(detailIdMatch).toBeTruthy();
  const detailId = detailIdMatch?.[1] ?? "";

  const createExport = await apiAsPageUser(page, `/v1/revisions/${detailId}/exports`, {
    method: "POST",
    data: { format: "json" }
  });
  expect(createExport.ok()).toBeTruthy();
  const artifact = (await createExport.json()) as { id: string };

  await expect
    .poll(
      async () => {
        const current = await apiAsPageUser(page, `/v1/exports/${artifact.id}`);
        if (!current.ok()) {
          return "missing";
        }
        const body = (await current.json()) as { status: string };
        return body.status;
      },
      { timeout: 30_000 }
    )
    .toMatch(/completed|failed/);

  const failResponse = await apiAsPageUser(page, `/v1/e2e/exports/${artifact.id}/fail`, {
    method: "POST",
    data: {
      errorMessage: "Forced E2E export failure.",
      failureKind: "permanent"
    }
  });
  expect(failResponse.ok()).toBeTruthy();

  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByTestId("export-item-failed")).toBeVisible();
  await expect(page.getByTestId("export-error-message")).toContainText("Forced E2E export failure.");
});

test("submit without validation is rejected", async ({ page }) => {
  const token = uniqueToken();
  await registerAndSignIn(page, {
    username: `noval-${token}`,
    email: `noval-${token}@example.com`
  });
  await createProjectHarnessAndOpenDetails(page, {
    projectName: `No Val Project ${token}`,
    harnessName: `No Val Harness ${token}`
  });

  await page.getByTestId("submit-for-quote-submit").click();
  await expect(page.getByTestId("details-page-error")).toContainText(/validation/i);
});
