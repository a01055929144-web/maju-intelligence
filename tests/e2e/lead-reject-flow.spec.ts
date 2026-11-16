import { expect, test } from "@playwright/test";

// CC-50b: 목록에서 단계 "거절"(사유) → 기본 목록에서 사라짐 (지도 거절함은 뺌). 가짜 API만 쓴다.
const now = "2026-11-15T00:00:00.000Z";
const base = { isActive: true, leadPeriod: "new", openDate: new Date().toISOString().slice(0, 10), industryPrimary: "한식", industryTags: [], isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now, latitude: 37.56, longitude: 126.98 };

for (const width of [1440, 390]) test(`리드 거절: 사유 저장 후 기본 목록에서 빠진다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const leads = [
    { ...base, id: "30000000-0000-4000-8000-000000000051", businessName: "합성거절식당", address: "서울 중구 가짜로 51", status: "신규" },
    { ...base, id: "30000000-0000-4000-8000-000000000052", businessName: "합성제외식당", address: "서울 중구 가짜로 52", status: "제외" },
    { ...base, id: "30000000-0000-4000-8000-000000000053", businessName: "합성진행식당", address: "서울 중구 가짜로 53", status: "신규" }
  ];
  const saved: Array<{ actionType: string; memo: string; result: string }> = [];
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads: leads.filter((lead) => lead.status !== "제외" && lead.status !== "거절"), salesRegionsConfigured: true } }));
  await page.route(/\/api\/leads\/permits\/[^/?]+\/action(\?|$)/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as { actionType: string; memo: string; result: string };
    saved.push(body);
    const lead = leads.find((item) => route.request().url().includes(item.id))!;
    lead.status = body.result;
    return route.fulfill({ json: { action: { id: "a1" }, status: body.result } });
  });

  await page.goto("/leads");
  await expect(page.getByText("합성거절식당").first()).toBeVisible();
  await expect(page.getByText("합성제외식당")).toHaveCount(0);
  const stage = page.getByRole("combobox", { name: "리드 상태 바꾸기" }).first();
  await stage.selectOption("거절");
  await page.getByRole("combobox", { name: "거절 사유" }).selectOption("단가");
  await page.getByRole("button", { name: "거절로 저장" }).last().click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].result).toBe("거절");
  expect(saved[0].memo).toContain("사유: 단가");
  // 목록 표에서만 확인(저장 알림·열린 상세에는 이름이 남는다)
  await expect(page.locator("tbody tr").filter({ hasText: "합성거절식당" })).toHaveCount(0);
  await expect(page.locator("tbody tr").filter({ hasText: "합성진행식당" })).toHaveCount(1);

  // 지도 "거절한 리드 보기" 화면은 CI에서 지도 화면 구성(필터 접힘·리드 표시 토글)을 확정하지 못해 이 시험에서 뺐다 — 배포 후 대표 확인.
});
