import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";

for (const width of [1440, 390]) test(`CX-93 admin distributor industries works at ${width}px`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width, height: width === 390 ? 844 : 900 } });
  try {
    const login = await context.request.post("/api/admin/login", { data: { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" } });
    expect(login.ok()).toBeTruthy();
    const page = await context.newPage();
    const response = await page.goto(`/admin/companies?companyId=${companyId}`, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("유통사 업종 관리", { exact: true })).toBeVisible();
    await expect(page.locator('input[value="농산 유통"]')).toBeVisible();
    await page.getByRole("checkbox", { name: "주류 유통" }).check();
    await page.getByRole("button", { name: "변경 영향 확인" }).click();
    await expect(page.getByText(/활성 연결 3건/)).toBeVisible();
    await page.getByRole("button", { name: "배정 저장" }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cx93-admin-industries-${width}.png`), fullPage: true });
  } finally { await context.close(); }
});
