import { expect, test } from "@playwright/test";
const company = "00000000-0000-4000-8000-000000000001";

for (const width of [1440, 390]) {
  test(`store link uses one catalog for PC controls and mobile price changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/storefront", route => route.fulfill({ json: {
      store: { title: "합성 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소",
        version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, nextDeliveryDate: null,
        selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "",
        policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
        lines: [
          { key: "fish", productId: "fish", promotionId: null, name: "합성 생선", category: "수산", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 12000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null, salesPriceDirection: "up" },
          { key: "meat", productId: "meat", promotionId: null, name: "합성 고기", category: "축산", brand: "", spec: "1kg", unit: "팩", badge: "", taxType: "exempt", unitPrice: 9000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null, salesPriceDirection: "down" },
        ] },
      orders: [], preferences: [], historyPage: 1, historyHasMore: false,
    } }));
    await page.goto("/store#synthetic-catalog-link");
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toBeVisible();
    await page.getByRole("button", { name: "변동 품목 주문하기" }).click();
    await page.getByRole("button", { name: "수산", exact: true }).click();
    await expect(page.getByText("합성 생선")).toBeVisible();
    await expect(page.getByText("합성 고기")).toHaveCount(0);
    if (width === 1440) {
      await page.getByRole("button", { name: "표형" }).click();
      await expect(page.getByText("품목 · 규격 · 판매가")).toBeVisible();
      await page.getByRole("button", { name: "데이터", exact: true }).click();
      await expect(page.getByRole("heading", { name: "매장 데이터" })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "주문", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "데이터", exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  });

  test(`company selling price direction consent defaults off in authorized preview at ${width}px`, async ({ page }) => {
    let available = false, optedIn = false, failOnce = true;
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/admin/login", { data: { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" } })).ok()).toBeTruthy();
    await page.route("**/api/pricing-order-settings*", async route => {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ companyId: company, action: "storefront-price-direction", enabled: true });
        if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { message: "합성 저장 실패. 다시 시도해 주세요." } }); }
        optedIn = true;
        return route.fulfill({ json: { result: true } });
      }
      return route.fulfill({ json: { settings: { cutoff_days_before: 1, cutoff_time: "22:00", minimum_amount: 0, minimum_policy: "notice", delivery_fee: 0, notice: "", market_price_notice: "", show_storefront_price_direction: optedIn }, priceDirectionAvailable: available, territories: [], territoryRules: [], holidays: [] } });
    });
    await page.goto(`/revenue/pricing/order-settings?companyId=${company}`);
    const consent = page.getByRole("checkbox", { name: "주문 링크에 판매가 상승·하락·보합 표시", exact: true });
    const save = page.getByRole("button", { name: "판매가 등락 공개 설정 저장", exact: true });
    await expect(consent).not.toBeChecked();
    await expect(save).toBeDisabled();
    available = true;
    await page.reload();
    await expect(consent).toBeEnabled();
    await expect(consent).not.toBeChecked();
    if (width === 390) expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await consent.check();
    await save.click();
    await expect(page.getByRole("status")).toContainText("합성 저장 실패");
    await expect(consent).toBeChecked();
    await save.click();
    await expect(page.getByRole("status")).toContainText("저장");
    await expect(consent).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  });

  for (const direction of [undefined, "up", "down", "flat"] as const) test(`public selling price direction ${direction ?? "hidden"} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/storefront", route => route.fulfill({ json: {
      store: { title: "합성 공개 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product", productId: "product", promotionId: null, name: "합성 상품", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null, ...(direction ? { salesPriceDirection: direction } : {}) }] },
      orders: [], preferences: [], historyPage: 1, historyHasMore: false,
    } }));
    await page.goto("/store#synthetic-direction-link");
    await page.getByRole("button", { name: "주문하기", exact: true }).click();
    if (direction) await expect(page.getByText(`판매가 ${direction === "up" ? "상승" : direction === "down" ? "하락" : "보합"}`, { exact: true })).toBeVisible();
    else await expect(page.getByText(/^판매가 /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  });
}
