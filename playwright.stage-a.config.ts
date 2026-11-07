import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/integration', outputDir: 'test-results/stage-a',
  timeout: 600_000, expect: { timeout: 20_000 }, workers: 1, retries: 0,
  reporter: [['line'], ['html', { open: 'never', outputFolder: 'stage-a-report' }]],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node scripts/run-stage-a-integration.mjs', url: 'http://127.0.0.1:3101/dashboard/login', reuseExistingServer: false, timeout: 120_000,
    env: {
      ADMIN_EMAIL: 'ci-admin@example.test', ADMIN_PASSWORD: process.env.STAGE_A_ADMIN_PASSWORD!,
      ADMIN_SESSION_SECRET: process.env.STAGE_A_SESSION_SECRET!,
      CUSTOMER_EMAIL: 'ci-owner@example.test', CUSTOMER_PASSWORD: process.env.STAGE_A_OWNER_PASSWORD!,
      CUSTOMER_COMPANY_ID: '00000000-0000-4000-8000-000000000001',
      PRICE_SHEETS_ENABLED: 'true', FEATURE_PRICING_COMPANY_IDS: '00000000-0000-4000-8000-000000000001',
      FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS: '00000000-0000-4000-8000-000000000001',
      PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS: '00000000-0000-4000-8000-000000000001',
      ACCOUNT_LOGIN_V2_ENABLED: 'false', FEATURE_ACCOUNT_LOGIN_V2: 'false', CI_LAYOUT_FIXTURES: 'disabled'
    }
  }
});
