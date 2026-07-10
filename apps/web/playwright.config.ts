import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3001"
  },
  webServer: {
    command: "npm run dev:full",
    cwd: "../..",
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      ENABLE_LEGACY_HEADER_AUTH: "true",
      STORE_BACKEND: "memory"
    }
  }
});
