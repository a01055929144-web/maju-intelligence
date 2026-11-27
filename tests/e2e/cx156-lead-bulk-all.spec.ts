import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const now = "2026-11-27T00:00:00.000Z";

for (const [width, count] of [[1440, 51], [390, 120]] as const) test(`CX-156 전체 ${count}곳을 이어서 불러온다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const leads = Array.from({ length: count }, (_, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    businessName: `합성리드${index + 1}`, address: `서울 가짜로 ${index + 1}`, latitude: 37.5, longitude: 127,
    leadPeriod: "old", industryPrimary: "한식", industryTags: [], isActive: true, isTargetIndustry: true,
    isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, status: "현장 확인",
    nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now
  }));
  const batches: number[] = [];
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads, salesRegionsConfigured: true } }));
  await page.route("**/api/leads/bulk-enrichment", async (route) => {
    const body = route.request().postDataJSON() as { leadIds: string[] };
    batches.push(body.leadIds.length);
    await route.fulfill({ json: {
      id: `40000000-0000-4000-8000-${String(batches.length).padStart(12, "0")}`, companyId,
      action: "external_info", status: "completed", totalItems: body.leadIds.length,
      succeededItems: body.leadIds.length, failedItems: 0, cancelRequestedAt: null, errorCode: null,
      maxItems: 5_000, remainingItems: 0
    } });
  });

  await page.goto("/map?panel=salesLead");
  await page.getByRole("checkbox", { name: "전체" }).check();
  await page.getByRole("button", { name: `외부 정보 불러오기 · ${count}곳` }).click();
  await expect(page.getByText("외부 정보를 모두 불러왔습니다", { exact: true })).toBeVisible();
  await expect(page.getByText(`${count}/${count}`, { exact: true })).toBeVisible();
  expect(batches).toEqual(count === 51 ? [50, 1] : [50, 50, 20]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
