import { expect, test } from "@playwright/test";

const now = "2026-11-18T00:00:00.000Z";
const first = "30000000-0000-4000-8000-000000000083";
const second = "30000000-0000-4000-8000-000000000084";
const base = { isActive: true, leadPeriod: "new", openDate: "2026-11-18", industryPrimary: "한식", industryTags: [], isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now, latitude: 37.56, longitude: 126.98, status: "신규" };
const leads = [
  { ...base, id: first, businessName: "합성별식당", address: "서울 중구 가짜로 83" },
  { ...base, id: second, businessName: "합성일반식당", address: "서울 중구 가짜로 84" }
];

async function openList(page: import("@playwright/test").Page, favoriteStatus: 200 | 403 | 404, failFirst = false) {
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const starred = new Set([first]);
  let firstRead = failFirst;
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads, salesRegionsConfigured: true } }));
  await page.route(/\/api\/leads\/favorites\?/, (route) => {
    if (firstRead) { firstRead = false; return route.fulfill({ status: 500, json: { message: "fake failure" } }); }
    if (favoriteStatus !== 200) return route.fulfill({ status: favoriteStatus, json: { message: favoriteStatus === 403 ? "forbidden" : "not found" } });
    const requested = new URL(route.request().url()).searchParams.getAll("leadId");
    return route.fulfill({ json: { favorites: requested.filter((id) => starred.has(id)).map((leadId) => ({ leadId, starred: true, starredAt: now, starredByName: "합성 담당자", starredByUserId: null })) } });
  });
  await page.route(/\/api\/leads\/[^/?]+\/favorite$/, async (route) => {
    const leadId = route.request().url().split("/").at(-2)!;
    const body = route.request().postDataJSON() as { starred: boolean };
    if (body.starred) starred.add(leadId); else starred.delete(leadId);
    return route.fulfill({ json: { favorite: { leadId, starred: body.starred, starredAt: body.starred ? now : null, starredByName: body.starred ? "합성 담당자" : null, starredByUserId: null } } });
  });
  await page.goto("/leads");
}

for (const width of [1440, 390]) test(`회사 공유 리드 즐겨찾기 목록과 빈 상태 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openList(page, 200, true);
  await expect(page.locator('[role="alert"]').filter({ hasText: "즐겨찾기를 불러오지 못했습니다" })).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("button", { name: "★만 1" })).toBeVisible();
  await page.getByRole("button", { name: "★만 1" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "합성별식당" })).toHaveCount(1);
  await expect(page.locator("tbody tr").filter({ hasText: "합성일반식당" })).toHaveCount(0);
  const unstar = page.locator('button[aria-label="합성별식당 즐겨찾기 해제"]');
  expect((await unstar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await unstar.click();
  await expect(page.getByText("즐겨찾기한 리드가 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "★만 0" }).click();
  await page.getByRole("button", { name: "합성일반식당 즐겨찾기", exact: true }).click();
  await expect(page.getByRole("button", { name: "★만 1" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`즐겨찾기 권한이 없으면 목록 조작을 숨긴다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openList(page, 403);
  await expect(page.getByRole("status")).toContainText("즐겨찾기 권한 없음");
  await expect(page.getByRole("button", { name: /즐겨찾기/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("기능 OFF 회사에는 즐겨찾기 UI를 표시하지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openList(page, 404);
  await expect(page.getByText("즐겨찾기 권한 없음")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /즐겨찾기/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /★만/ })).toHaveCount(0);
});
