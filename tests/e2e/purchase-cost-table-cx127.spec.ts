import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`purchase cost table keeps eight default fields with 1,369 products at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const companyId = "00000000-0000-4000-8000-000000000001";
  const products = Array.from({ length: 1369 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `ERP-${index + 1}`,
    name: `합성 상품 ${index + 1}`,
    spec: "1kg",
    unit: "EA",
    cost: 1000 + index,
    priceDate: "2026-11-20",
    taxType: index ? "taxable" : null,
    supplierName: index % 2 ? "합성 매입처 B" : "합성 매입처 A",
  }));
  await page.request.post("/api/customer/login", {
    data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" },
  });
  await page.route("**/api/price-sheets/costs*", route => route.fulfill({ json: {
    products, changes: [], suppliers: [], batchEnabled: true, purchaseDateEnabled: true, latestBatch: null,
  } }));
  await page.route("**/api/price-sheets/costs/date-batches*", route => route.fulfill({ json: {
    enabled: true, latestBatch: null, maxRows: 5000, undatedPrices: [],
  } }));
  await page.route(/\/api\/price-sheets(?:\?|$)/, route => route.fulfill({ json: {
    groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0,
    total: 0, page: 1, pageSize: 50,
  } }));
  await page.route("**/api/price-sheets/receipts*", route => route.fulfill({ json: { summary: [] } }));
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: {
    result: { items: [], total: 0 }, manager: true,
  } }));

  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByText("과세 미정 1품목")).toBeVisible();
  await expect(page.getByLabel("매입처 검색")).toBeVisible();
  await expect(page.getByText("1-50 / 1369")).toBeVisible();
  if (width === 1440) {
    await expect(page.locator("table[aria-colcount] thead th[data-col]")).toHaveCount(8);
    await expect(page.locator("table[aria-colcount] thead th[data-col]")).toContainText([
      "품목", "규격", "단위", "현재 매입가", "이번 매입가", "현재 대비", "매입일", "상태",
    ]);
  } else {
    await expect(page.locator("table[aria-colcount]")).toHaveCount(0);
    await expect(page.getByText("합성 상품 1", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
