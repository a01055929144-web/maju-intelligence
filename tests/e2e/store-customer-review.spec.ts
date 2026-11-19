import { expect, test } from "@playwright/test";

const store = {
  storeAccountId: "10000000-0000-4000-8000-000000000001",
  customerId: "20000000-0000-4000-8000-000000000001",
  storeName: "합성 신촌점",
  customerName: "자동 생성 합성 신촌점",
  businessRegistrationNumber: "1234567890",
  businessStatus: "active",
  address: "서울특별시 합성구 합성로 1 1층",
  createdAt: "2026-11-19T00:00:00Z",
};

for (const width of [1440, 390]) test(`새 매장 확인: 새 매출처·기존 연결 경계 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const actions: string[] = [];
  await page.route("**/api/customer/store-reviews", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: [store] } });
    const body = route.request().postDataJSON() as { action: string };
    actions.push(body.action);
    if (body.action === "candidates") return route.fulfill({ json: { candidates: [{ customerId: "30000000-0000-4000-8000-000000000001", name: "기존 합성 매출처", address: "서울 합성로", reason: "business_number" }] } });
    return route.fulfill({ json: { customerId: "30000000-0000-4000-8000-000000000001" } });
  });
  await page.goto("/customers/stores");
  await expect(page.getByRole("heading", { name: "새 매장 확인" })).toBeVisible();
  await expect(page.getByText("합성 신촌점").first()).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: /^123-45-67890$/ })).toBeVisible();
  await page.getByRole("button", { name: "기존 매출처에 연결" }).click();
  await expect(page.getByLabel("연결할 기존 매출처")).toHaveValue("30000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "선택한 매출처에 연결" }).click();
  await expect.poll(() => actions).toEqual(["candidates", "link_existing"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
