import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

export async function expectHeadingWithRetry(page: Page, headingName: string, timeoutMs = 20_000) {
  const heading = page.getByRole("heading", { name: headingName });
  try {
    await expect(heading).toBeVisible({ timeout: 5_000 });
    return;
  } catch {
    const notFoundHeading = page.getByRole("heading", { name: "404" });
    if (await notFoundHeading.isVisible().catch(() => false)) {
      await page.reload();
    }
    await expect(heading).toBeVisible({ timeout: timeoutMs });
  }
}

export async function registerAndSignIn(
  page: Page,
  input: { username: string; email: string; password?: string }
) {
  const password = input.password ?? "pass1234!";
  await page.goto("/register");
  await page.getByLabel("Username").fill(input.username);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  try {
    await expect(page).toHaveURL("/", { timeout: 5_000 });
  } catch {
    await page.goto("/login");
    await page.getByLabel("Email").fill(input.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  }

  await expect(page.getByRole("heading", { name: "Cable Design Tool Frontend (MVP)" })).toBeVisible();
}

export async function openDetailsWithRetry(page: Page) {
  const harnessMatch = /\/harnesses\/([0-9a-f-]+)/i.exec(page.url());
  const harnessCanvasPath = harnessMatch ? `/harnesses/${harnessMatch[1]}/canvas` : "/";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.getByRole("link", { name: "Details" }).click();
      await expectHeadingWithRetry(page, "Details", 15_000);
      return;
    } catch {
      await page.goto(harnessCanvasPath);
      await expectHeadingWithRetry(page, "Harness Canvas");
    }
  }

  throw new Error("Could not open details after retries.");
}

export async function createProjectAndOpenProjectPage(page: Page, projectName: string) {
  await page.goto("/");
  await page.getByText("Create project", { exact: true }).click();
  const createProjectForm = page.getByTestId("create-project-form");
  await createProjectForm.getByLabel("Name").fill(projectName);
  await page.getByTestId("create-project-submit").click();
  const projectLink = page.getByRole("link", { name: projectName });
  await expect(projectLink).toBeVisible();
  await projectLink.click();
  await expectHeadingWithRetry(page, "Project workspace");
}

export async function createHarnessOnProjectPage(page: Page, harnessName: string) {
  await page.locator("summary", { hasText: "Create harness" }).click();
  await page.getByLabel("Harness name").fill(harnessName);
  await page.getByTestId("create-harness-submit").click();
  await expect(page.getByRole("heading", { name: "Harness Canvas" })).toBeVisible();
}

export async function openRevisionWorkspace(page: Page) {
  await page.getByRole("link", { name: "Open Revision Workspace" }).click();
  await expect(page).toHaveURL(/\/details\/[0-9a-f-]+/, { timeout: 20_000 });
  await expectHeadingWithRetry(page, "Details");
  await expect(page.getByTestId("details-bom-section")).toBeVisible({ timeout: 15_000 });
}

export async function createProjectHarnessAndOpenDetails(
  page: Page,
  input: { projectName: string; harnessName: string }
) {
  await createProjectAndOpenProjectPage(page, input.projectName);
  await createHarnessOnProjectPage(page, input.harnessName);
  await openRevisionWorkspace(page);
}

export async function getSessionCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "cdt_session");
  if (!session?.value) {
    throw new Error("Missing cdt_session cookie.");
  }
  return `cdt_session=${session.value}`;
}

export async function apiAsPageUser(
  page: Page,
  path: string,
  options: {
    method?: string;
    data?: unknown;
    failOnStatusCode?: boolean;
  } = {}
) {
  const cookieHeader = await getSessionCookieHeader(page);
  return page.request.fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      cookie: cookieHeader,
      "content-type": "application/json"
    },
    data: options.data,
    failOnStatusCode: options.failOnStatusCode ?? false
  });
}

export async function registerUserViaApi(
  request: APIRequestContext,
  input: { username: string; email: string; password?: string }
) {
  const password = input.password ?? "pass1234!";
  const response = await request.post(`${API_BASE_URL}/v1/auth/register`, {
    data: {
      username: input.username,
      email: input.email,
      password
    },
    failOnStatusCode: false
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    user: { id: string; email: string };
    sessionToken: string;
  };
  return { ...body, password };
}

export function uniqueToken() {
  return Date.now();
}

async function getAdminSessionCookie(request: APIRequestContext): Promise<string> {
  const password = "pass1234!";
  const email = "meckert@vpc.com";
  const register = await request.post(`${API_BASE_URL}/v1/auth/register`, {
    data: {
      username: `compat-admin-${Date.now()}`,
      email,
      password
    },
    failOnStatusCode: false
  });
  if (register.ok()) {
    const body = (await register.json()) as { sessionToken: string };
    return `cdt_session=${body.sessionToken}`;
  }
  const login = await request.post(`${API_BASE_URL}/v1/auth/login`, {
    data: { email, password },
    failOnStatusCode: false
  });
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { sessionToken: string };
  return `cdt_session=${body.sessionToken}`;
}

export async function ingestFullCableCatalog(request: APIRequestContext) {
  const {
    FULL_CABLE_CATALOG_ITEMS,
    FULL_CABLE_MODULE_BACKSHELL_COMPAT,
    FULL_CABLE_MODULE_STRAIN_RELIEF_COMPAT
  } = await import("./fixtures/full-cable");
  const ingest = await request.post(`${API_BASE_URL}/v1/library/components/ingest`, {
    headers: {
      "content-type": "application/json",
      "x-role": "editor",
      "x-user-id": "e2e-catalog-seed"
    },
    data: { items: FULL_CABLE_CATALOG_ITEMS }
  });
  expect(ingest.ok()).toBeTruthy();
  for (const item of FULL_CABLE_CATALOG_ITEMS) {
    const review = await request.post(`${API_BASE_URL}/v1/library/components/${item.id}/review`, {
      headers: {
        "content-type": "application/json",
        "x-role": "owner",
        "x-user-id": "e2e-catalog-reviewer"
      },
      data: {}
    });
    expect(review.ok()).toBeTruthy();
  }

  const adminCookie = await getAdminSessionCookie(request);
  for (const row of FULL_CABLE_MODULE_BACKSHELL_COMPAT) {
    const response = await request.put(`${API_BASE_URL}/v1/library/compat/module-backshell`, {
      headers: {
        cookie: adminCookie,
        "content-type": "application/json"
      },
      data: row
    });
    expect(response.ok()).toBeTruthy();
  }
  for (const row of FULL_CABLE_MODULE_STRAIN_RELIEF_COMPAT) {
    const response = await request.put(`${API_BASE_URL}/v1/library/compat/module-strain-relief`, {
      headers: {
        cookie: adminCookie,
        "content-type": "application/json"
      },
      data: row
    });
    expect(response.ok()).toBeTruthy();
  }
}

