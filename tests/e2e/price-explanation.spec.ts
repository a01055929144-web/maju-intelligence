import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`price explanation keeps its empty state usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  expect((await page.request.post("/api/customer/login", {
    data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  })).ok()).toBeTruthy();

  await page.goto("/revenue/pricing/explanation");
  await expect(page.getByRole("heading", { name: "단가 근거 보기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "매장과 상품을 선택해 주세요" })).toBeVisible();
  await expect(page.getByRole("link", { name: "카탈로그로 돌아가기" })).toHaveAttribute("href", "/revenue/pricing/catalog");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
