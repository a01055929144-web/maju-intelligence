import { expect, test } from "@playwright/test";

// CC-60: 리드 화면 "전국 공공데이터" 수집 상태 — 성공 · 이월 · 오류 3가지(가짜 API). 1440 · 390.
const summary = { lastRunAt: "2026-11-16T05:13:00Z", errorAreas: 0, deferredAreas: 0, pendingAreas: 0, weekFetched: 120, noNewRows: false };
const cases = [
  { name: "성공", body: { ...summary, result: "success", message: "정상 · 남은 지역 없음" }, expectText: ["성공", "정상 · 남은 지역 없음", "남은(이월) 지역 0곳", "최근 7일 수집 120건"] },
  { name: "이월", body: { ...summary, result: "partial", pendingAreas: 2, deferredAreas: 2, message: "일부 완료 · 남은 2곳은 다음 실행에서 이어받음 (시간 예산 이월 2곳)" }, expectText: ["일부 완료(이어받기)", "남은 2곳", "남은(이월) 지역 2곳"] },
  { name: "오류", body: { ...summary, result: "error", errorAreas: 2, deferredAreas: 2, pendingAreas: 4, weekFetched: 0, message: "수집 실패 · 오류 2곳 · 시간 예산 이월 2곳" }, expectText: ["실패", "수집 실패 · 오류 2곳 · 시간 예산 이월 2곳", "남은(이월) 지역 4곳"] }
];

for (const width of [1440, 390]) for (const item of cases) test(`공공데이터 수집 상태: ${item.name} (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/leads\/gov-sync-overview/, (route) => route.fulfill({ json: { summary: item.body } }));
  await page.goto("/leads");
  await page.getByRole("button", { name: "리드 공급원·파일 업로드 상세" }).click();
  const box = page.getByRole("group", { name: "전국 공공데이터 수집 상태" });
  await expect(box).toBeVisible();
  for (const text of item.expectText) await expect(box).toContainText(text);
  await expect(box).toContainText("자동 수집: 15분마다");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
