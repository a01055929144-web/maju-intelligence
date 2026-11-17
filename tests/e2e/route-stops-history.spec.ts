import { expect, test } from "@playwright/test";

// CC-67: 지도 "배송 이력"이 정류장(delivery_route_stops) 기준 기록을 먼저 보여 주고, 영업 정류장은 점선. 정류장이 없는 날은 칸 자체가 없다. 가짜 API. 1440 · 390.
const stops = [
  { id: "s1", order: 1, type: "delivery", status: "completed", name: "합성배송식당", driverName: "합성기사", arrivedAt: "2026-11-16T01:00:00Z", completedAt: "2026-11-16T01:20:00Z", reasonLabel: null, photoCount: 2 },
  { id: "s2", order: 2, type: "sales", status: "not_delivered", name: "합성영업매장", driverName: "합성기사", arrivedAt: null, completedAt: null, reasonLabel: "문이 닫혀 있음", photoCount: 0 }
];

for (const width of [1440, 390]) for (const withStops of [true, false]) test(`배송 이력 정류장 기준: ${withStops ? "정류장 있음" : "없음"} (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/route-stops/, (route) => route.fulfill({ json: { stops: withStops ? stops : [] } }));
  await page.goto("/map");
  await page.locator('button[title^="달력에서 날짜를 골라"]').click();
  const box = page.getByRole("region", { name: "정류장 기준 배송 기록" });
  if (!withStops) { await page.waitForTimeout(800); await expect(box).toHaveCount(0); return; }
  await expect(box).toContainText("1. 합성배송식당");
  await expect(box).toContainText("완료");
  await expect(box).toContainText("사진 2장");
  await expect(box).toContainText("2. 합성영업매장");
  await expect(box).toContainText("영업 · 단가표");
  await expect(box).toContainText("문이 닫혀 있음");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
