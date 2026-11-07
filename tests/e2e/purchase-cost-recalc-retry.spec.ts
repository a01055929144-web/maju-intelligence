import { expect, test } from "@playwright/test";

test("failed price recalculation stays visible after reload and can be retried", async ({ page }) => {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const productId = "20000000-0000-4000-8000-000000000001";
  let cost = 100;
  let pendingCount = 0;
  let recalculationAttempts = 0;

  await page.request.post("/api/customer/login", {
    data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" },
  });
  await page.route("**/api/price-sheets/costs*", (route) => {
    if (route.request().method() === "POST") {
      cost = 200;
      pendingCount = 1;
      return route.fulfill({ json: { saved: 1 } });
    }
    return route.fulfill({ json: { products: [{ id: productId, code: "ERP-1", name: "합성 상품", spec: "1kg", unit: "봉", cost }], changes: [], suppliers: [] } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      recalculationAttempts++;
      if (recalculationAttempts === 1) return route.fulfill({ status: 503, json: { message: "일시적인 재계산 실패" } });
      pendingCount = 0;
    }
    return route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount, total: 0, page: 1, pageSize: 50, lastBatch: null, restored: false } });
  });
  await page.route("**/api/price-sheets/receipts*", (route) => route.fulfill({ json: { summary: [] } }));
  await page.route("**/api/pricing-documents*", (route) => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));

  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" }).fill("200");
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "판매가 재계산은 실패했습니다" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "판매가 재계산 완료" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /판매가 다시 계산/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /판매가 다시 계산/ })).toBeVisible();
  await page.getByRole("button", { name: /판매가 다시 계산/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "판매가를 다시 계산했습니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: /판매가 다시 계산/ })).toHaveCount(0);
  expect(recalculationAttempts).toBe(2);
});
