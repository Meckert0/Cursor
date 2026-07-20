import { expect, test } from "@playwright/test";
import {
  createHarnessOnProjectPage,
  createProjectAndOpenProjectPage,
  expectHeadingWithRetry,
  registerAndSignIn,
  uniqueToken
} from "./helpers";

test("dashboard supports project rename and delete", async ({ page }) => {
  const token = uniqueToken();
  const initialName = `Rename Me ${token}`;
  const renamedName = `Renamed ${token}`;

  await registerAndSignIn(page, {
    username: `rename-${token}`,
    email: `rename-${token}@example.com`
  });
  await page.goto("/");
  await page.getByText("Create project", { exact: true }).click();
  const createProjectForm = page.getByTestId("create-project-form");
  await createProjectForm.getByLabel("Name").fill(initialName);
  await page.getByTestId("create-project-submit").click();
  await expect(page.getByRole("link", { name: initialName })).toBeVisible();

  const row = page.locator("li", { has: page.getByRole("link", { name: initialName }) });
  await row.getByText("Rename project", { exact: true }).click();
  await row.getByLabel(`Rename ${initialName}`).fill(renamedName);
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("link", { name: renamedName })).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  const renamedRow = page.locator("li", { has: page.getByRole("link", { name: renamedName }) });
  await renamedRow.getByTestId(/delete-project-/).click();
  await expect(page.getByRole("link", { name: renamedName })).not.toBeVisible();
});

test("harness root route redirects to canvas and keeps details access", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Blocked Project ${token}`;
  const harnessName = `Blocked Harness ${token}`;

  await registerAndSignIn(page, {
    username: `blocked-${token}`,
    email: `blocked-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  await page.goto(page.url().replace(/\/canvas$/, ""));
  await expect(page).toHaveURL(/\/harnesses\/[0-9a-f-]+\/canvas$/);
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();

  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

test("legacy revision routes redirect to details routes", async ({ page }) => {
  const token = uniqueToken();
  const projectName = `Redirect Project ${token}`;
  const harnessName = `Redirect Harness ${token}`;

  await registerAndSignIn(page, {
    username: `redir-${token}`,
    email: `redir-${token}@example.com`
  });
  await createProjectAndOpenProjectPage(page, projectName);
  await createHarnessOnProjectPage(page, harnessName);

  const harnessMatch = /\/harnesses\/([0-9a-f-]+)\/canvas$/i.exec(page.url());
  expect(harnessMatch).toBeTruthy();
  const harnessId = harnessMatch?.[1] ?? "";
  await page.goto(`/harnesses/${harnessId}/revisions/new`);
  await expect(page).toHaveURL(new RegExp(`/harnesses/${harnessId}/details/new$`));
  await expectHeadingWithRetry(page, "Details");

  await page.getByRole("link", { name: "Back to canvas" }).click();
  const detailsHref = await page.getByRole("link", { name: "Open Revision Workspace" }).getAttribute("href");
  expect(detailsHref).toBeTruthy();
  const detailIdMatch = /\/details\/([0-9a-f-]+)$/i.exec(detailsHref ?? "");
  expect(detailIdMatch).toBeTruthy();
  const detailId = detailIdMatch?.[1] ?? "";
  await page.goto(`/revisions/${detailId}`);
  await expect(page).toHaveURL(new RegExp(`/details/${detailId}$`));
  await expectHeadingWithRetry(page, "Details");
});
