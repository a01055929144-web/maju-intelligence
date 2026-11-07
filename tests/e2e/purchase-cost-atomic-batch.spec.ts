import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`atomic purchase cost save and restore remain available after reload at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const companyId = "00000000-0000-4000-8000-000000000001";
  const productId = "20000000-0000-4000-8000-000000000001";
  const batchId = "30000000-0000-4000-8000-000000000001";
  let cost = 100;
  let saved = false;
  let restored = false;
  let legacyPriceCommands = 0;

  await page.request.post("/api/customer/login", {
    data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  });
  await page.route("**/api/price-sheets/costs*", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { action?: string; changes?: Array<{ cost: number }> };
      if (body.action === "save-batch") {
        expect(body.changes?.[0].cost).toBe(200);
        saved = true; cost = 200;
        return route.fulfill({ json: { batchId, status: "applied", priceRunId: "run" } });
      }
      if (body.action === "restore-batch") {
        restored = true; cost = 100;
        return route.fulfill({ json: { batchId, status: "restored" } });
      }
      throw new Error("Legacy cost write should not run with atomic batch enabled");
    }
    return route.fulfill({ json: {
      batchEnabled: true, latestBatch: saved ? { id: batchId, restoredAt: restored ? "2026-11-07T00:00:00Z" : null } : null,
      products: [{ id: productId, code: "ERP-1", name: "합성 상품", spec: "1kg", unit: "봉", cost }], changes: [], suppliers: []
    } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") legacyPriceCommands++;
    return route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 50, lastBatch: null, restored: false } });
  });
  await page.route("**/api/price-sheets/receipts*", (route) => route.fulfill({ json: { summary: [] } }));
  await page.route("**/api/pricing-documents*", (route) => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));

  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" }).fill("200");
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  await expect(page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" })).toBeEnabled();

  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "직전 매입가·판매가를 함께 복구했습니다" })).toBeVisible();
  expect(restored).toBe(true);
  expect(legacyPriceCommands).toBe(0);
});
