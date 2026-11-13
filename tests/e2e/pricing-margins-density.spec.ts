import { expect, test } from "@playwright/test";

// CC-33 P7: 1440 × 900 첫 화면에서 판매가 표가 15줄 이상 보이고 쪽 전체 좌우 스크롤이 없다.
test("margins page shows 15+ table rows at 1440px without horizontal scroll", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const products = Array.from({ length: 30 }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: `합성 상품 ${i + 1}`, category: "합성 > 분류", groupId: null, itemMargin: null, directPrice: null, cost: 1000, price: 1200, appliedCost: 1000, appliedMargin: 12, appliedRounding: 10, active: true }));
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => route.fulfill({ json: { groups: [], categories: [], items: products, defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: products.length, page: 1, pageSize: 50, lastBatch: null, restored: false } }));
  await page.route("**/api/price-sheets/categories*", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/revenue/pricing/margins");
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  const visibleRows = await rows.evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; }).length);
  expect(visibleRows).toBeGreaterThanOrEqual(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
