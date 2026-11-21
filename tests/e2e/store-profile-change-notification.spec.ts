import { expect, test, type Page } from "@playwright/test";

async function loginCustomer(page: Page) {
  const response = await page.request.post("/api/customer/login", { data: {
    email: "ci-owner@example.test", password: "ci-owner-layout-password-2026",
  } });
  expect(response.ok()).toBeTruthy();
}

for (const width of [1440, 390]) test(`CX-94 profile change decision works at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await loginCustomer(page);
  const actions: string[] = [];
  await page.route("**/api/customer/store-notifications", async (route) => {
    if (route.request().method() === "PATCH") {
      actions.push(route.request().postDataJSON().action);
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ json: { items: [{
      id: "notification-1", notificationType: "store_profile_changed", subject: "합성 변경 매장", createdAt: "2026-11-17T00:00:00Z",
      beforeValues: { baseAddress: "서울 합성로 1", accessNote: "정문" }, afterValues: { baseAddress: "서울 합성로 9", accessNote: "뒷문" },
    }] } });
  });
  await page.goto("/orders");
  await page.getByRole("button", { name: "전후 비교 보기 (2칸)" }).click();
  await expect(page.getByRole("cell", { name: "서울 합성로 1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "서울 합성로 9" })).toBeVisible();
  await page.getByRole("button", { name: width === 390 ? "무시" : "매출처에 반영" }).click();
  expect(actions).toEqual([width === 390 ? "ignore" : "process"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
