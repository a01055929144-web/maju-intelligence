import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`CX-124 새 매장 확인·연결 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/business-partners\/new-stores/, async route => {
    const body = route.request().postDataJSON?.() as { action?: string } | null;
    if (body?.action === "candidates") return route.fulfill({ json: { candidates: [{ customerId: "30000000-0000-4000-8000-000000000001", name: "기존 합성 매출처", address: "서울 합성로 1", reason: "name_address" }] } });
    if (body?.action === "link_customer") return route.fulfill({ json: { customerId: "30000000-0000-4000-8000-000000000001", movedOrders: 0 } });
    return route.fulfill({ json: { items: [{ storeAccountId: "20000000-0000-4000-8000-000000000001", customerId: "10000000-0000-4000-8000-000000000001", name: "새 합성 매장", address: "서울 합성로 1", businessNumber: null, createdAt: "2026-11-18T00:00:00Z" }] } });
  });
  await page.goto("/partners/new-stores");
  await expect(page.getByRole("heading", { level: 2, name: "새 매장 확인" })).toBeVisible();
  await page.getByRole("button", { name: "매출처 확인" }).click();
  await expect(page.getByText("기존 합성 매출처")).toBeVisible();
  await page.getByRole("button", { name: "이 매출처에 연결" }).click();
  await expect(page.getByRole("status")).toContainText("연결했습니다");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
