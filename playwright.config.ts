import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/layout",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/dashboard/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ADMIN_EMAIL: "ci-admin@example.test",
      ADMIN_PASSWORD: "ci-admin-layout-password-2026",
      ADMIN_SESSION_SECRET: "ci-layout-session-secret-not-for-production",
      CUSTOMER_EMAIL: "ci-owner@example.test",
      CUSTOMER_PASSWORD: "ci-owner-layout-password-2026",
      CUSTOMER_COMPANY_ID: "00000000-0000-4000-8000-000000000001"
    }
  }
});
