import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`today tasks remain focused at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
    try {
      const login = await context.request.post("/api/customer/login", {
        data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" },
      });
      expect(login.ok()).toBeTruthy();
      const page = await context.newPage();
      const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      const tasks = page.getByRole("region", { name: "오늘 할 일", exact: true });
      await expect(tasks).toBeVisible();
      await expect(tasks).not.toContainText("0건");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 3);
      await page.screenshot({ path: testInfo.outputPath(`dashboard-today-tasks-${viewport.width}.png`), fullPage: false });
    } finally {
      await context.close();
    }
  });
}
