import { expect, test } from "@playwright/test";

// CC-59: 리드 상세 "가는 길에 넣기" — 스위치 켜짐(가짜 API): 오늘·내일 경로 → 넣기 → 결과 문구. 스위치 꺼짐이면 버튼이 없다. 1440 · 390.
const now = "2026-11-15T00:00:00.000Z";
const base = { isActive: true, leadPeriod: "new", openDate: new Date().toISOString().slice(0, 10), industryPrimary: "한식", industryTags: [], isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now, latitude: 37.56, longitude: 126.98 };
const leadId = "30000000-0000-4000-8000-000000000059";
const lead = { ...base, id: leadId, businessName: "합성가는길식당", address: "서울 중구 가짜로 59", status: "신규" };
const driver = { driverMemberId: "30000000-0000-4000-8000-0000000000d1", name: "합성기사", stopCount: 3, alreadyAdded: false, suggestion: { extraMinutes: 7 } };

for (const width of [1440, 390]) for (const enabled of [true, false]) test(`가는 길에 넣기: 스위치 ${enabled ? "켜짐" : "꺼짐"} (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const posted: Array<{ leadId: string; date: string; driverMemberId: string }> = [];
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads: [lead], salesRegionsConfigured: true } }));
  await page.route(/\/api\/leads\/route-stops/, async (route) => {
    if (route.request().method() === "POST") { posted.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, insertAt: 2, extraMinutes: 7 } }); }
    const day = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({ json: enabled ? { enabled: true, hasLeadPoint: true, drivers: day === "today" ? [driver] : [] } : { enabled: false, drivers: [] } });
  });
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByText("합성가는길식당").first()).toBeVisible();
  const open = page.getByRole("button", { name: "가는 길에 넣기" });
  if (!enabled) { await expect(open).toHaveCount(0); return; }
  await open.click();
  const box = page.getByRole("group", { name: "가는 길에 넣기" });
  await expect(box).toContainText("합성기사 · 정류장 3곳 · +7분");
  await expect(box).toContainText("배송 경로가 없습니다.");
  await box.getByRole("button", { name: "넣기" }).click();
  await expect(box).toContainText("오늘 합성기사 경로에 넣었습니다 (+7분)");
  expect(posted).toEqual([{ leadId, date: "today", driverMemberId: driver.driverMemberId }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
