import { expect, test } from "@playwright/test";
import { registerAndSignIn, uniqueToken } from "./helpers";

test("home page renders for signed-in users", async ({ page }) => {
  const token = uniqueToken();
  await registerAndSignIn(page, {
    username: `home-${token}`,
    email: `home-${token}@example.com`
  });
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backend health" })).toBeVisible();
});

test("admin overview route redirects non-admin users", async ({ page }) => {
  const token = uniqueToken();
  await registerAndSignIn(page, {
    username: `nonadmin-${token}`,
    email: `nonadmin-${token}@example.com`
  });
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Cable Design Tool Frontend (MVP)" })).toBeVisible();
});

test("login rejects invalid credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("missing-user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});
