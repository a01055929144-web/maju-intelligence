import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);

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
      CUSTOMER_COMPANY_ID: "00000000-0000-4000-8000-000000000001",
      HOLD_MODULES_ENABLED_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      ERP_ORDER_DOCUMENTS: "true",
      ERP_ORDER_DOCUMENTS_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      BUSINESS_DOCUMENT_CANCELLATION_ENABLED: "true",
      BUSINESS_DOCUMENT_CANCELLATION_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      PRICE_SHEETS_ENABLED: "true",
      STORE_ORDERING_ENABLED: "true",
      STORE_LINK_SECRET: "ci-spec-store-link-secret-not-for-production",
      STORE_PUBLIC_BASE_URL: "https://store.example.test",
      FEATURE_STORE_ORDERING_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_PRICING_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_PRICE_EXPLANATION_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_MARGIN_TEMPLATES_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_DRIVER_SALES_STOPS_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_STORE_PROFILE_SETTINGS_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_STORE_PROFILE_DELIVERY_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      CI_ADMIN_STORE_FIXTURES: "enabled",
      FEATURE_PARTNER_PAYMENTS_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_PARTNER_REGISTRATION_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_NEW_STORE_CUSTOMER_REVIEW_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      ORDER_FULFILLMENT: "true",
      ORDER_FULFILLMENT_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
      FEATURE_DRIVER_RUN_EXPERIENCE_COMPANY_IDS: "00000000-0000-4000-8000-000000000001",
    }
  }
});
