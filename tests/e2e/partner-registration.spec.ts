import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`CX-126 공통 거래처 등록은 개업 준비와 반응형 경계를 지킨다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();

    await page.goto("/partners/register?type=customer");
    await expect(page.getByRole("heading", { name: "매출처 등록" })).toBeVisible();
    await page.locator("select").first().selectOption("registration_pending");
    await expect(page.getByText("개업 예정일 (선택)")).toBeVisible();
    await expect(page.getByText("사업자번호", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
