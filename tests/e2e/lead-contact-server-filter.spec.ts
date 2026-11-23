import { expect, test } from "@playwright/test";

const now = "2026-11-20T00:00:00.000Z";
const makeLead = (index: number, email = "") => ({
  id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  businessName: `합성채널식당 ${index}`,
  address: `서울 중구 가짜로 ${index}`,
  phone: "",
  instagramUrl: `https://instagram.com/fake-${index}`,
  email,
  isActive: true,
  leadPeriod: "new",
  openDate: "2020-01-01",
  industryPrimary: "한식",
  industryTags: [],
  isTargetIndustry: true,
  isTemporaryOperation: false,
  isTemporaryOperationSuspected: false,
  isDuplicate: false,
  nextActionReasons: [],
  scoreTotal: 50,
  scoreBreakdown: {},
  grade: "B",
  status: "신규",
  createdAt: now,
  updatedAt: now
});

async function login(page: import("@playwright/test").Page) {
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
}

for (const width of [1440, 390]) test(`연락 채널 필터는 회사 전체 페이지와 AND 조건을 맞춘다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  const firstPage = Array.from({ length: 50 }, (_, index) => makeLead(index + 1, index === 0 ? "owner@example.test" : ""));
  const secondPage = [makeLead(51)];
  const requestedPages: string[] = [];
  await page.route(/\/api\/leads\/permits\?/, (route) => {
    const url = new URL(route.request().url());
    const channel = url.searchParams.get("contactChannel");
    if (!channel) return route.fulfill({ json: { leads: [firstPage[0]], total: 51, salesRegionsConfigured: true } });
    requestedPages.push(`${channel}:${url.searchParams.get("page")}:${url.searchParams.get("pageSize")}`);
    return route.fulfill({ json: { leads: url.searchParams.get("page") === "2" ? secondPage : firstPage, page: Number(url.searchParams.get("page")), pageSize: 50, total: 51, salesRegionsConfigured: true } });
  });
  await page.route(/\/api\/leads\/favorites\?/, (route) => route.fulfill({ status: 404, json: { message: "not found" } }));

  await page.goto("/leads?type=keyword");
  await page.getByRole("button", { name: "인스타 있음" }).click();
  await expect.poll(() => requestedPages).toContain("instagram:1:50");
  await expect.poll(() => requestedPages).toContain("instagram:2:50");
  await page.getByRole("button", { name: /필터 더보기/ }).click();
  await page.getByLabel("이메일", { exact: true }).check();
  await expect(page.getByText("1-1 / 1곳", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "현재 페이지 선택" }).click();
  await expect(page.getByText("선택 1곳", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("연락 채널 회사 전체 조회의 빈 상태와 오류를 안내한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  let fail = false;
  await page.route(/\/api\/leads\/permits\?/, (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("contactChannel") && fail) return route.fulfill({ status: 500, json: { message: "fake failure" } });
    return route.fulfill({ json: { leads: url.searchParams.has("contactChannel") ? [] : [makeLead(1)], total: url.searchParams.has("contactChannel") ? 0 : 1, salesRegionsConfigured: true } });
  });
  await page.route(/\/api\/leads\/favorites\?/, (route) => route.fulfill({ status: 404, json: { message: "not found" } }));

  await page.goto("/leads?type=keyword");
  await page.getByRole("button", { name: "인스타 있음" }).click();
  await expect(page.getByText("현재 조건에 맞는 리드가 없습니다.")).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "인스타 있음" }).click();
  await page.getByRole("button", { name: "인스타 있음" }).click();
  await expect(page.getByText("신규 리드를 불러오지 못했습니다.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
