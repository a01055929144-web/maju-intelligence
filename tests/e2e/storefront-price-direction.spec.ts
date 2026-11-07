import { expect, test } from "@playwright/test";
const company = "00000000-0000-4000-8000-000000000001";

for (const width of [1440, 390]) test(`store links verify settings before issuance at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const login = await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  expect(login.ok()).toBeTruthy();
  let settingsFail = true, issued = 0;
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: { result: new URL(route.request().url()).searchParams.get("action") === "versions"
    ? [{ id: "version", version: 1, content: { title: "합성 발행본" }, publishedAt: "2026-11-08T00:00:00Z" }]
    : { items: [{ id: "document", revision: 1, content: { title: "합성 문서" } }] } } }));
  await page.route("**/api/pricing-order-settings*", route => {
    if (new URL(route.request().url()).searchParams.has("customerQuery")) return route.fulfill({ json: { customers: [{ id: "customer", customer_name: "합성 매장" }] } });
    return settingsFail ? route.fulfill({ status: 503, json: { message: "합성 주문 설정 확인 실패. 다시 시도해 주세요." } })
      : route.fulfill({ json: { settings: { cutoff_time: "22:00", minimum_amount: 10000 } } });
  });
  await page.route("**/api/pricing-store-links*", route => {
    if (route.request().method() === "POST") { issued++; return route.fulfill({ json: { url: "https://store.example.test/store#synthetic-first-order-link" } }); }
    return route.fulfill({ json: { items: [], hasMore: false } });
  });
  await page.goto("/revenue/pricing/links");
  await page.getByLabel("문서 선택", { exact: true }).selectOption("document");
  await page.getByLabel("발행 버전", { exact: true }).selectOption("version");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByLabel("링크를 받을 매장").selectOption("customer");
  const create = page.getByRole("button", { name: "링크 만들고 복사", exact: true });
  await create.click();
  await expect(page.getByRole("status")).toContainText("합성 주문 설정 확인 실패");
  expect(issued).toBe(0);
  settingsFail = false;
  await create.click();
  await expect(page.getByLabel("방금 만든 매장 링크")).toHaveValue("https://store.example.test/store#synthetic-first-order-link");
  await expect(page.getByRole("status").filter({ hasText: "저장된 주문 설정 확인" })).toContainText("10,000원");
  expect(issued).toBe(1);
  const check = page.getByRole("button", { name: "주문 설정 다시 확인", exact: true });
  expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`stage-c-settings-link-${width}.png`), fullPage: true });
});

for (const width of [1440, 390]) {
  test(`store catalog controls retain delivery price guards at ${width}px`, async ({ page }, info) => {
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width, height: 900 });
    const firstDay = "2099-01-05", secondDay = "2099-01-06";
    const products = [
      { id: "10000000-0000-4000-8000-000000000001", name: "합성 생선", category: "수산", price: 12000, direction: "up" },
      { id: "10000000-0000-4000-8000-000000000002", name: "합성 고기", category: "축산", price: 9000, direction: "down" },
      { id: "10000000-0000-4000-8000-000000000003", name: "합성 채소", category: "농산", price: 4000, direction: "flat" },
      { id: "10000000-0000-4000-8000-000000000004", name: "합성 기타", category: "", price: 6000, direction: "flat" },
    ];
    let releaseDate: (() => void) | undefined, failDate = true;
    let expired = false;
    let preferences: { productId: string; isFavorite: boolean; isHidden: boolean; willNotOrder: boolean }[] = [];
    const response = (day: string) => ({
      store: { title: "합성 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31",
        priceAvailable: !expired, canOrder: !expired, nextDeliveryDate: firstDay, selectedDeliveryDate: day, notice: "", marketPriceNotice: "",
        policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
        lines: products.map(product => ({ key: `${product.id}:`, productId: product.id, promotionId: null, name: product.name, category: product.category,
          brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: day === secondDay ? product.price + 1000 : product.price,
          priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null, salesPriceDirection: product.direction })) },
      orders: [{ id: "50000000-0000-4000-8000-000000000001", deliveryDate: firstDay, status: "submitted", knownTotal: 16000, requestMemo: "", marketPricePending: false,
        submittedAt: "2026-11-06T00:00:00Z", revision: 1, lines: [products[0], products[2]].map(product => ({ product_id: product.id, promotion_id: null, product_name: product.name, quantity: 1, unit_price: product.price, total_amount: product.price })) }],
      preferences, historyPage: 1, historyHasMore: false,
    });
    await page.route("**/api/storefront", async route => {
      const body = route.request().postDataJSON();
      expect(body).not.toHaveProperty("companyId");
      if (route.request().method() === "PATCH") {
        preferences = [...preferences.filter(item => item.productId !== body.productId), { productId: body.productId, isFavorite: body.isFavorite, isHidden: body.isHidden, willNotOrder: body.willNotOrder }];
        return route.fulfill({ json: { saved: true } });
      }
      expect(route.request().method()).toBe("POST");
      if (body.deliveryDate === secondDay && failDate) {
        await new Promise<void>(resolve => { releaseDate = resolve; }); failDate = false;
        return route.fulfill({ status: 503, json: { message: "합성 배송일 조회 실패" } });
      }
      return route.fulfill({ json: response(body.deliveryDate || firstDay) });
    });
    await page.goto("/store#synthetic-catalog-link");
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toBeVisible();
    await page.getByRole("button", { name: "변동 품목 주문하기" }).click();
    const rows = page.locator("main li");
    const categories = page.getByRole("group", { name: "품목 대분류", exact: true });
    const views = page.getByRole("group", { name: "품목 보기", exact: true });
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "홈", exact: true }).click();
    await page.getByRole("button", { name: "주문하기", exact: true }).click();
    await expect(rows).toHaveCount(4);
    await categories.getByRole("button", { name: "농산", exact: true }).click();
    await expect(rows).toHaveCount(1); await expect(rows).toContainText("합성 채소");
    await categories.getByRole("button", { name: "미분류", exact: true }).click();
    await expect(rows).toHaveCount(1); await expect(rows).toContainText("합성 기타");
    await categories.getByRole("button", { name: "전체", exact: true }).click();
    await page.getByLabel("정렬", { exact: true }).selectOption("price");
    await expect(rows.locator("strong")).toHaveText(["합성 채소", "합성 기타", "합성 고기", "합성 생선"]);
    await page.getByRole("button", { name: "내림차순으로 변경", exact: true }).click();
    await expect(rows.locator("strong")).toHaveText(["합성 생선", "합성 고기", "합성 기타", "합성 채소"]);
    await page.getByLabel("정렬", { exact: true }).selectOption("name");
    await page.getByRole("button", { name: "오름차순으로 변경", exact: true }).click();
    await expect(rows.locator("strong")).toHaveText(["합성 고기", "합성 기타", "합성 생선", "합성 채소"]);
    await categories.getByRole("button", { name: "수산", exact: true }).click();
    await expect(page.getByText("합성 생선")).toBeVisible();
    await expect(page.getByText("합성 고기")).toHaveCount(0);
    if (width === 1440) {
      await page.getByRole("button", { name: "표형", exact: true }).click();
      await expect(page.getByText("품목 · 규격 · 판매가")).toBeVisible();
      await page.getByRole("button", { name: "격자형", exact: true }).click();
    } else await expect(page.getByRole("button", { name: "표형", exact: true })).toBeHidden();
    await rows.getByRole("button", { name: "즐겨찾기", exact: true }).click();
    await views.getByRole("button", { name: "즐겨찾기", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "내역", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("합성 생선 1 · 합성 채소 1");
    await expect(page.getByRole("table")).toContainText("16,000원");
    await page.getByRole("button", { name: "다시 담기", exact: true }).click();
    await expect(rows).toHaveCount(4);
    await expect(categories.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(views.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("합성 생선 수량", { exact: true })).toHaveText("1");
    await expect(page.getByLabel("합성 채소 수량", { exact: true })).toHaveText("1");
    const submit = page.getByRole("button", { name: "후결제로 주문 신청", exact: true });
    await expect(submit).toBeEnabled();
    await page.getByLabel("배송일", { exact: true }).fill(secondDay);
    await expect.poll(() => Boolean(releaseDate)).toBe(true);
    await expect(submit).toBeDisabled(); await expect(page.getByLabel("정렬", { exact: true })).toBeDisabled();
    await expect(page.getByText("확정된 품목 합계", { exact: false })).toHaveCount(0);
    await expect(rows.getByText("12,000원", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "내역", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("16,000원", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 담기", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "데이터", exact: true }).click();
    await expect(page.getByText("배송일 가격 확인 필요", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "홈", exact: true }).click();
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toHaveCount(0);
    await page.getByRole("button", { name: "주문", exact: true }).click();
    releaseDate!();
    await expect(page.getByText("합성 배송일 조회 실패", { exact: true })).toBeVisible();
    await expect(submit).toBeDisabled();
    await page.getByRole("button", { name: "내역", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("16,000원", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 담기", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "주문", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`store-controls-price-error-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
    await expect(submit).toBeEnabled();
    await expect(page.getByText("확정된 품목 합계 18,000원", { exact: true })).toBeVisible();
    if (width === 1440) await page.getByRole("button", { name: "표형", exact: true }).click();
    for (const target of [page.getByLabel("정렬", { exact: true }), rows.first().getByRole("button", { name: /수량 늘리기/ })]) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: info.outputPath(`store-controls-ready-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "데이터", exact: true }).click();
    await expect(page.getByRole("heading", { name: "매장 데이터" })).toBeVisible();
    await expect(page.getByRole("button", { name: "변동 품목 보기", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "주문", exact: true }).click();
    for (const name of ["합성 생선", "합성 고기"]) {
      await rows.filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "품목 숨기기", exact: true }).click();
    }
    await page.getByRole("button", { name: "데이터", exact: true }).click();
    await expect(page.getByRole("heading", { name: "판매가 변동", exact: true }).locator("..").getByText("0품목", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "변동 품목 보기", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "홈", exact: true }).click();
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toHaveCount(0);
    expired = true;
    await page.reload();
    await page.getByRole("button", { name: "내역", exact: true }).click();
    await expect(page.getByText("문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "주문", exact: true }).click();
    await expect(page.getByText("확정된 품목 합계", { exact: false })).toHaveCount(0);
    await expect(page.getByText("12,000원", { exact: true })).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await page.getByRole("button", { name: "내역", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("16,000원", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 담기", exact: true })).toHaveCount(0);

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
    else await expect(page.getByText(/^판매가 (상승|하락|보합)$/)).toHaveCount(0);
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
    orders: saved.size ? [{ id: "order", deliveryDate: thirdDay, status: "submitted", knownTotal: 2000, requestMemo: "", marketPricePending: false, submittedAt: "2026-11-06T00:00:00Z", revision: 1, lines: [{ product_id: "product", promotion_id: null, product_name: "주문 당시 품목", specification: "주문 당시 규격", sales_unit: "통", tax_type: "exempt", quantity: 1, unit_price: 2000, total_amount: 2000 }] }] : [], preferences: [], historyPage: 1, historyHasMore: false,
  });
  await page.route("**/api/storefront", async route => {
    const body = route.request().postDataJSON();
    if (body.token === "synthetic-revoked-link") return route.fulfill({ status: 404, json: { message: "사용할 수 없는 매장 링크입니다. 새 링크를 요청해 주세요." } });
    if (body.token === "synthetic-second-store") {
      const next = response(firstDay);
      next.store.companyName = "다른 합성 유통"; next.store.customerName = "두 번째 매장"; next.orders = [];
      return route.fulfill({ json: next });
    }
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
  await expect(page.getByText(/주문 당시 품목.*주문 당시 규격.*면세.*2,000원/)).toBeVisible();
  await page.evaluate(() => { window.location.hash = "synthetic-second-store"; });
  await expect(page.getByText("다른 합성 유통 · 두 번째 매장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "내역", exact: true }).click();
  await expect(page.getByText("아직 주문이 없습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText("주문 당시 품목", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "주문", exact: true }).click();
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "합성 주문 품목 수량 늘리기" }).click();
  await page.evaluate(() => { window.location.hash = "synthetic-revoked-link"; });
  await expect(page.getByText(/사용할 수 없는 매장 링크입니다/)).toBeVisible();
  await expect(page.getByText("두 번째 매장", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toHaveCount(0);
  expect(saved.size).toBe(1);

});
