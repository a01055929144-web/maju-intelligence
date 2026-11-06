import { expect, test } from "@playwright/test";
const company = "00000000-0000-4000-8000-000000000001";

for (const width of [1440, 390]) {
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

for (const width of [1440, 390]) test(`store order waits for delivery date prices and retries without duplicate order at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const firstDay = "2099-01-05", secondDay = "2099-01-06", thirdDay = "2099-01-07";
  let failInitial = true, failDate = true, failSubmit = true;
  let releaseOld: (() => void) | undefined;
  let oldRequested = false;
  const submissions: Record<string, unknown>[] = [], saved = new Set<string>();
  const response = (day: string) => ({
    store: { title: "합성 게시 버전 2", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, nextDeliveryDate: firstDay, selectedDeliveryDate: day, notice: "", marketPriceNotice: "", policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product:", productId: "product", promotionId: null, name: "합성 주문 품목", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: day === firstDay ? 1000 : 2000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
    orders: saved.size ? [{ id: "order", deliveryDate: thirdDay, status: "submitted", knownTotal: 2000, requestMemo: "", marketPricePending: false, submittedAt: "2026-11-06T00:00:00Z", revision: 1, lines: [{ product_id: "product", promotion_id: null, product_name: "합성 주문 품목", quantity: 1, unit_price: 2000, total_amount: 2000 }] }] : [], preferences: [], historyPage: 1, historyHasMore: false,
  });
  await page.route("**/api/storefront", async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === "PUT") {
      submissions.push(body); saved.add(body.idempotencyKey);
      if (failSubmit) { failSubmit = false; return route.fulfill({ status: 503, json: { message: "합성 주문 응답 실패. 다시 시도해 주세요." } }); }
      return route.fulfill({ json: { result: { id: "order" } } });
    }
    if (failInitial) { failInitial = false; return route.fulfill({ status: 503, json: { message: "합성 최초 조회 실패" } }); }
    const day = body.deliveryDate || firstDay;
    if (day === secondDay && failDate) { failDate = false; return route.fulfill({ status: 503, json: { message: "합성 배송일 조회 실패" } }); }
    if (day === secondDay) {
      oldRequested = true;
      await new Promise<void>(resolve => { releaseOld = resolve; });
    }
    return route.fulfill({ json: response(day) });
  });
  await page.goto("/store#synthetic-order-link");
  await expect(page.getByText("합성 최초 조회 실패")).toBeVisible();
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: "합성 주문 품목 수량 늘리기" }).click();
  const submit = page.getByRole("button", { name: "후결제로 주문 신청", exact: true });
  const day = page.getByLabel("배송일", { exact: true });
  await expect(submit).toBeEnabled();
  await day.fill(secondDay);
  await expect(page.getByText("합성 배송일 조회 실패")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(page.getByText("확정된 품목 합계", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect.poll(() => oldRequested).toBe(true);
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: info.outputPath(`store-order-price-loading-${width}.png`), fullPage: true });
  await day.fill(thirdDay);
  await expect(submit).toBeEnabled();
  const oldResponse = page.waitForResponse(response => response.url().endsWith("/api/storefront") && response.request().postDataJSON().deliveryDate === secondDay);
  releaseOld!();
  await oldResponse;
  await expect(day).toHaveValue(thirdDay);
  await expect(page.getByText("확정된 품목 합계 2,000원", { exact: true })).toBeVisible();
  await day.fill("");
  await expect(submit).toBeDisabled();
  await day.fill(thirdDay);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("status")).toContainText("합성 주문 응답 실패");
  await submit.click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(submissions[0]).toMatchObject({ token: "synthetic-order-link", deliveryDate: thirdDay, lines: [{ productId: "product", promotionId: null, quantity: 1 }] });
  expect(Object.keys(submissions[0])).not.toContain("companyId");
  expect(saved.size).toBe(1);
  await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`store-first-order-${width}.png`), fullPage: true });
});
