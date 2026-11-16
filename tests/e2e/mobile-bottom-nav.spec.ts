import { expect, test } from "@playwright/test";

// CX-46a: 기사 코스 화면은 D-3 확정안의 3개 하단 메뉴를 공용 BottomNav로 그린다(390).
test("기사 코스 화면: 공용 하단 메뉴 · 오늘 코스/배송 기록/더보기", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.goto("/mobile/today");
  const nav = page.getByRole("navigation", { name: "기사 하단 메뉴" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(3);
  await expect(nav.getByRole("link", { name: "오늘 코스" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "배송 기록" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "더보기" })).toBeVisible();
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
});
