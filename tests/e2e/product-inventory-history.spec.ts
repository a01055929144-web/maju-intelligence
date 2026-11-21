import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`product inventory history shows the outbound store without page overflow at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width, height: width === 390 ? 844 : 900 } });
    try {
      const login = await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
      expect(login.ok()).toBeTruthy();
      const page = await context.newPage();
      await page.goto("/revenue/products", { waitUntil: "commit" });
      await expect(page.getByText("깐양파").first()).toBeVisible();
      await page.getByRole("button", { exact: true, name: "기록" }).first().click({ timeout: 10_000 });
      await expect(page.getByRole("heading", { name: /재고 이동 기록/ })).toBeVisible();
      await expect(page.getByText("테스트 한식당", { exact: true })).toBeVisible();
      await expect(page.getByText(/출고 매장/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(3);
    } finally {
      await context.close();
    }
  });
}
