import { expect, test } from "@playwright/test";

// CC-40: 숨긴 상품은 기본 목록에서 빠지고 `숨긴 상품 N` 칩에서만 보인다. 손해 상품은 `손해 N` 칩에서만 따로 볼 수 있다.
test("sales price table hides inactive products and offers loss and hidden chips", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const base = { category: "합성 > 분류", groupId: null, itemMargin: null, directPrice: null, appliedCost: 1000, appliedMargin: 12, appliedRounding: 10 };
  const products = [
    { ...base, id: "20000000-0000-4000-8000-000000000001", name: "합성 정상 상품", cost: 1000, price: 1200, active: true },
    { ...base, id: "20000000-0000-4000-8000-000000000002", name: "합성 손해 상품", cost: 1000, price: 900, active: true },
    { ...base, id: "20000000-0000-4000-8000-000000000003", name: "합성 숨긴 상품", cost: 1000, price: 1200, active: false },
  ];
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => route.fulfill({ json: { groups: [], categories: [], items: products, defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: products.length, page: 1, pageSize: 50, lastBatch: null, restored: false } }));
  await page.route("**/api/price-sheets/categories*", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/revenue/pricing/margins");
  await expect(page.getByText("합성 정상 상품")).toBeVisible();
  await expect(page.getByText("합성 숨긴 상품")).toHaveCount(0);

  await page.getByRole("button", { name: "손해 1", exact: true }).click();
  await expect(page.getByText("합성 손해 상품")).toBeVisible();
  await expect(page.getByText("합성 정상 상품")).toHaveCount(0);
  await page.getByRole("button", { name: "손해 1", exact: true }).click();

  await page.getByRole("button", { name: "숨긴 상품 1", exact: true }).click();
  await expect(page.getByText("합성 숨긴 상품")).toBeVisible();
  await expect(page.getByText("합성 정상 상품")).toHaveCount(0);
});
