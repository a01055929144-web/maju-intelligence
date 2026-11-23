import { expect, test } from "@playwright/test";

const leadId = "30000000-0000-4000-8000-000000000079";
const now = "2026-11-17T00:00:00.000Z";

for (const width of [1440, 390]) test(`CX-79 목록과 상세 상태가 즉시 일치한다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const lead = { id: leadId, businessName: "합성상태식당", address: "서울 중구 가짜로 79", latitude: 37.56, longitude: 126.98, leadPeriod: "old", industryPrimary: "한식", industryTags: [], isActive: true, isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, status: "현장 확인", nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now };
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads: [lead], salesRegionsConfigured: true } }));
  await page.route(/\/api\/leads\/permits\/[^/?]+\/action(\?|$)/, async (route) => {
    const body = route.request().postDataJSON() as { result: string };
    lead.status = body.result;
    await route.fulfill({ json: { action: { id: "a79" }, status: body.result } });
  });

  await page.goto("/map?panel=salesLead");
  const listStage = page.getByRole("combobox", { name: "합성상태식당 단계" });
  await expect(listStage).toHaveValue("");
  await expect(listStage.locator("option:checked")).toHaveText("현장 확인");
  await page.getByRole("button", { name: "합성상태식당 상세 열기" }).click();
  await page.getByRole("dialog", { name: "합성상태식당 리드 상세" }).getByRole("combobox", { name: "리드 상태 바꾸기" }).selectOption("연락 완료");
  await expect(listStage).toHaveValue("연락 완료");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
