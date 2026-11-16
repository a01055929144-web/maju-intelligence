import { expect, test } from "@playwright/test";

// CC-52: 기사 코스 화면 하단 메뉴가 공용 BottomNav 하나로 그려진다(390).
test("기사 코스 화면: 공용 하단 메뉴 · 4개 이동 + 가운데 기록 버튼", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.goto("/mobile/today");
  const nav = page.getByRole("navigation", { name: "모바일 현장 바로가기" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByRole("link", { name: "가장 가까운 매장 배송 기록" })).toBeVisible();
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
});
