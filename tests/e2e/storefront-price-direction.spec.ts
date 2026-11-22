import { expect, test } from "@playwright/test";
import { storeTab } from "./store-tab";
const company = "00000000-0000-4000-8000-000000000001";

for (const width of [1440, 390]) test(`CX-116 shows and enforces product cutoffs at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let passed = false;
  await page.route("**/api/storefront", route => route.fulfill({ json: {
    mobileCommon: true,
    orderCutoffGuidance: { serverNow: passed ? "2099-01-01T04:00:00.000Z" : "2098-12-31T00:00:00.000Z" },
    store: { title: "합성 품목 마감", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소",
      version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, nextDeliveryDate: "2099-01-01",
      selectedDeliveryDate: passed ? "2099-01-02" : "2099-01-01", notice: "", marketPriceNotice: "",
      policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "23:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: [{ key: "product:", productId: "product", promotionId: null, name: "합성 마감 품목", category: "농산", brand: "", spec: "1kg", unit: "봉",
        badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null,
        recentDispatchPrice: null, recentDispatchDate: null, productCutoff: { cutoffAtKst: "2099-01-01T12:00:00+09:00", daysBefore: 0, time: "12:00" } }] },
    preferences: [], orders: [], historyPage: 1, historyHasMore: false,
  } }));
  await page.goto("/store#synthetic-cx116");
  await storeTab(page, "주문").click();
  if (width === 1440) await page.getByRole("button", { name: "격자형" }).click();
  await expect(page.getByText("이 상품 0일 전 12:00 마감").first()).toBeVisible();
  await page.getByRole("button", { name: "합성 마감 품목 수량 늘리기" }).click();
  await expect(page.getByLabel("합성 마감 품목 수량", { exact: true })).toHaveText("1");
  passed = true;
  await page.getByLabel("배송일").fill("2099-01-02");
  await expect(page.getByText("마감 지남 — 다음 배송일로").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "합성 마감 품목 수량 늘리기" })).toBeDisabled();
  if (width === 390) await page.getByRole("button", { name: /장바구니 확인/ }).click();
  await expect(page.getByText("마감 지남 — 품목을 빼거나 다음 배송일로 바꿔 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "후결제로 주문 신청" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});

for (const width of [1440, 390]) test(`CX-67 read-only order detail preserves server amounts and clears revoked documents at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const id = "70000000-0000-4000-8000-000000000067";
  let detailReads = 0, writes = 0, mode = "error", detailsEnabled = true;
  const lines = [
    { id: "line", product_id: "product", promotion_id: null, product_name: "합성 긴 상품명 주문 당시 스냅샷", specification: "2.5kg", sales_unit: "BOX", tax_type: "exempt", quantity: 2.5, unit_price: 1000, total_amount: 1234 },
    { id: "zero", product_id: "free", promotion_id: null, product_name: "합성 무상 품목", specification: "", sales_unit: "EA", quantity: 1, unit_price: 0, total_amount: 0 },
    { id: "market", product_id: "market", promotion_id: null, product_name: "합성 시가 품목", specification: "", sales_unit: "EA", quantity: 1, unit_price: null, total_amount: null },
  ];
  await page.route("**/api/storefront", route => {
    if (route.request().method() !== "POST") { writes++; return route.fulfill({ status: 500, json: {} }); }
    const body = route.request().postDataJSON();
    if (body.orderDetailId) {
      detailReads++;
      expect(body).toEqual({ token: "synthetic-cx67", orderDetailId: id });
      if (mode === "error" || mode === "revoked") return route.fulfill({ status: mode === "revoked" ? 403 : 503, json: { message: "합성 읽기 오류" } });
      return route.fulfill({ json: { orderDetail: { id, delivery_date: "2099-01-05", status: mode === "empty" ? "received" : "in_delivery",
        known_total: mode === "empty" ? 0 : 7777, has_market_price: mode !== "empty", submitted_at: "2026-11-18T00:00:00Z",
        lines: mode === "empty" ? [] : lines,
        ...(mode === "empty" ? {} : { document: { id: "document", revision: 2, documentNumber: "합성-전표-067", totalAmount: 1501,
          lines: [{ id: "document-line", name: "합성 실제 출고 품목", quantity: 1.5, unit: "BOX", unitPrice: 1000, lineAmount: 1499 }] } }) } } });
    }
    const expired = body.token === "synthetic-cx67-expired";
    return route.fulfill({ json: { mobileCommon: true, orderDetailsEnabled: !expired && detailsEnabled,
      store: { title: "합성 CX67", companyName: expired ? "합성 만료 유통" : "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 배송지", version: 1,
        validUntil: "2099-12-31", priceAvailable: !expired, canOrder: !expired, selectedDeliveryDate: "2099-01-05", nextDeliveryDate: "2099-01-05",
        notice: "", marketPriceNotice: "", lines: [], policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 } },
      preferences: [], orders: expired ? [] : [{ id, status: "in_delivery", deliveryDate: "2099-01-05", knownTotal: 7777,
        requestMemo: "합성 요청 메모", marketPricePending: true, submittedAt: "2026-11-18T00:00:00Z", revision: 3, lines }], historyPage: 1, historyHasMore: false } });
  });
  await page.goto("/store#synthetic-cx67");
  await storeTab(page, "내역").click();
  const detail = page.getByLabel(`주문 상세 ${id}`, { exact: true });
  const summary = detail.locator(":scope > summary");
  await summary.click(); expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(detail).toContainText("7,777원"); await expect(detail).toContainText("1,234원");
  await expect(detail).toContainText("단가 미정"); await expect(detail).toContainText("금액 미정");
  await expect(detail.getByText("0원", { exact: true }).first()).toBeVisible();
  expect(detailReads).toBe(0);
  const refresh = detail.getByRole("button", { name: "최신 주문·전표 확인", exact: true });
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await refresh.click(); await expect(detail).toContainText("주문·전표를 확인하지 못했습니다");
  mode = "ready"; await detail.getByRole("button", { name: "전표 다시 확인", exact: true }).click();
  const documentSummary = detail.locator("summary").filter({ hasText: "합성-전표-067" });
  await expect(documentSummary).toContainText("1,501원"); await documentSummary.click();
  await expect(detail).toContainText("1,499원"); await expect(detail).toContainText("배송 중");
  expect((await documentSummary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  // The full smoke pass clears layout output; this existing artifact folder is retained.
  await page.screenshot({ path: `test-results/readonly-pg17/cx67-ui/cx67-order-detail-${width}.png`, fullPage: true });
  mode = "revoked"; await refresh.click();
  await expect(detail).toContainText("주문·전표를 확인하지 못했습니다");
  await expect(detail.locator("summary").filter({ hasText: "합성-전표-067" })).toHaveCount(0);
  mode = "empty"; await detail.getByRole("button", { name: "전표 다시 확인", exact: true }).click();
  await expect(detail).toContainText("주문 품목 정보가 없습니다"); await expect(detail).toContainText("출고 확인 전");
  await expect(detail).toContainText("확인 가능한 확정 전표가 없습니다");
  detailsEnabled = false;
  await page.reload();
  await storeTab(page, "내역").click();
  await expect(page.locator(`[data-store-order-id="${id}"]`)).toContainText("7,777원");
  await expect(detail).toHaveCount(0);
  if (width === 1440) await expect(page).toHaveURL(/[?&]view=history(?:&|#|$)/);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/api/storefront") &&
      response.request().postDataJSON()?.token === "synthetic-cx67-expired"),
    page.evaluate(() => { window.location.hash = "synthetic-cx67-expired"; }),
  ]);
  await expect(page.getByText("합성 만료 유통 · 합성 매장", { exact: true })).toBeVisible();
  await storeTab(page, "내역").click();
  await expect(page.getByText("문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다.", { exact: false })).toBeVisible();
  await expect(page.getByLabel(`주문 상세 ${id}`, { exact: true })).toHaveCount(0);
  expect(detailReads).toBe(4); expect(writes).toBe(0);
});

for (const width of [1440, 390]) test(`store links verify settings before issuance at ${width}px`, async ({ page }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  const login = await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  expect(login.ok()).toBeTruthy();
  let settingsFail = true, customersAvailable = false, issued = 0;
  let minimumAmount: number | null = null;
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: { result: new URL(route.request().url()).searchParams.get("action") === "versions"
    ? [{ id: "version", version: 1, content: { title: "합성 발행본" }, publishedAt: "2026-11-08T00:00:00Z" }]
    : { items: [{ id: "document", revision: 1, content: { title: "합성 문서" } }] } } }));
  await page.route("**/api/pricing-order-settings*", route => {
    if (new URL(route.request().url()).searchParams.has("customerQuery")) return route.fulfill({ json: { customers: customersAvailable ? [{ id: "customer", customer_name: "합성 매장" }] : [] } });
    return settingsFail ? route.fulfill({ status: 503, json: { message: "합성 주문 설정 확인 실패. 다시 시도해 주세요." } })
      : route.fulfill({ json: { settings: { cutoff_time: "22:00", minimum_amount: minimumAmount } } });
  });
  await page.route("**/api/pricing-store-links*", route => {
    if (route.request().method() === "POST") { issued++; return route.fulfill({ json: { url: "https://store.example.test/store#synthetic-first-order-link" } }); }
    return route.fulfill({ json: { items: [], hasMore: false } });
  });
  await page.goto("/revenue/pricing/links");
  await page.getByLabel(/^문서 선택/).selectOption("document");
  await page.getByLabel(/^발행 버전/).selectOption("version");
  const create = page.getByRole("button", { name: "링크 만들고 복사", exact: true });
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByText("검색된 거래처가 없습니다.", { exact: false })).toBeVisible();
  await expect(create).toBeDisabled();
  expect(issued).toBe(0);
  const registration = page.getByRole("link", { name: "거래처 등록 화면 열기", exact: true });
  await expect(registration).toHaveAttribute("href", "/");
  expect((await registration.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText("표시할 매장 링크가 없습니다.", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`stage-c-empty-customers-${width}.png`), fullPage: true });
  customersAvailable = true;
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByLabel("링크를 받을 매장").selectOption("customer");
  expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await create.click();
  await expect(page.getByRole("status")).toContainText("합성 주문 설정 확인 실패");
  expect(issued).toBe(0);
  settingsFail = false;
  await create.click();
  await expect(page.getByLabel("방금 만든 매장 링크")).toHaveValue("https://store.example.test/store#synthetic-first-order-link");
  await expect(page.getByRole("status").filter({ hasText: "저장된 주문 설정 확인" })).toContainText("최소 확인 필요");
  expect(issued).toBe(1);
  const check = page.getByRole("button", { name: "주문 설정 다시 확인", exact: true });
  expect((await check.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  minimumAmount = 10000;
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: "저장된 주문 설정 확인" })).toContainText("10,000원");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`stage-c-settings-link-${width}.png`), fullPage: true });
  customersAvailable = false;
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByText("검색된 거래처가 없습니다.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("링크를 받을 매장")).toHaveValue("");
  await expect(create).toBeDisabled();
  expect(issued).toBe(1);
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
        priceAvailable: !expired, canOrder: !expired, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0,1,2,3,4,5,6] }, nextDeliveryDate: firstDay, selectedDeliveryDate: day, notice: "", marketPriceNotice: "",
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
    if (width === 1440) await page.getByRole("button", { name: "격자형", exact: true }).click();
    const rows = page.getByRole("list", { name: "주문 품목" }).getByRole("listitem");
    const categories = page.getByRole("group", { name: "품목 대분류", exact: true });
    const views = page.getByRole("group", { name: "품목 보기", exact: true });
    await expect(rows).toHaveCount(2);
    await storeTab(page, "홈").click();
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
      await expect(page.getByRole("columnheader", { name: /품목/ })).toBeVisible();
      await page.getByRole("button", { name: "격자형", exact: true }).click();
    } else await expect(page.getByRole("button", { name: "표형", exact: true })).toBeHidden();
    await rows.getByRole("button", { name: "즐겨찾기", exact: true }).click();
    await views.getByRole("button", { name: "즐겨찾기", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await storeTab(page, "내역").click();
    await expect(page.getByRole("table").getByRole("listitem")).toHaveText(["합성 생선 1개 · 12,000원", "합성 채소 1개 · 4,000원"]);
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
    await storeTab(page, "내역").click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("16,000원", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 담기", exact: true })).toHaveCount(0);
    await storeTab(page, "데이터").click();
    // PC 사이드바는 서버 페이지 전환이라 클릭 직후엔 이전 탭이 잠깐 남는다. 탭 화면이 뜬 뒤에 확인한다.
    await expect(page.getByRole("heading", { name: "매장 데이터", exact: true })).toBeVisible();
    await expect(page.getByText("배송일 가격 확인 필요", { exact: true })).toBeVisible();
    await storeTab(page, "홈").click();
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toHaveCount(0);
    await storeTab(page, "주문").click();
    releaseDate!();
    await expect(page.getByText("합성 배송일 조회 실패", { exact: true })).toBeVisible();
    await expect(submit).toBeDisabled();
    await storeTab(page, "내역").click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("16,000원", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 담기", exact: true })).toHaveCount(0);
    await storeTab(page, "주문").click();
    await page.screenshot({ path: info.outputPath(`store-controls-price-error-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
    await expect(submit).toBeEnabled();
    await expect(page.getByText("확정된 품목 합계 18,000원", { exact: true })).toBeVisible();
    for (const target of [page.getByLabel("정렬", { exact: true }), rows.first().getByRole("button", { name: /수량 늘리기/ })]) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: info.outputPath(`store-controls-ready-${width}.png`), fullPage: true });
    await storeTab(page, "데이터").click();
    await expect(page.getByRole("heading", { name: "매장 데이터" })).toBeVisible();
    await expect(page.getByRole("button", { name: "변동 품목 보기", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
    await storeTab(page, "주문").click();
    for (const name of ["합성 생선", "합성 고기"]) {
      await rows.filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "품목 숨기기", exact: true }).click();
    }
    await storeTab(page, "데이터").click();
    await expect(page.getByRole("heading", { name: "판매가 변동", exact: true }).locator("..").getByText("0품목", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "변동 품목 보기", exact: true })).toBeDisabled();
    await storeTab(page, "홈").click();
    await expect(page.getByRole("heading", { name: "판매가 변동" })).toHaveCount(0);
    await page.getByRole("button", { name: "주문 품목 전체 보기", exact: true }).click();
    await expect(rows).toHaveCount(4);
    await expect(page.getByRole("status")).toContainText("이 발행 문서의 주문 가능 품목 전체");
    await expect(page.getByLabel("합성 생선 수량", { exact: true })).toHaveText("0");
    await expect(page.getByLabel("합성 채소 수량", { exact: true })).toHaveText("1");
    await page.goto("/store?products=all#synthetic-catalog-link");
    const restoredRows = width === 1440 ? page.getByRole("table").locator("tbody tr") : rows;
    await expect(restoredRows).toHaveCount(4);
    await expect(page.getByRole("status")).toContainText("다른 문서의 품목은 포함하지 않습니다");
    expired = true;
    await page.reload();
    await storeTab(page, "내역").click();
    await expect(page.getByText("문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다.", { exact: false })).toBeVisible();
    await storeTab(page, "주문").click();
    await expect(page.getByText("확정된 품목 합계", { exact: false })).toHaveCount(0);
    await expect(page.getByText("12,000원", { exact: true })).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await storeTab(page, "내역").click();
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
      store: { title: "합성 공개 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0,1,2,3,4,5,6] }, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product", productId: "product", promotionId: null, name: "합성 상품", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null, ...(direction ? { salesPriceDirection: direction } : {}) }] },
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
    store: { title: "합성 게시 버전 2", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0,1,2,3,4,5,6] }, nextDeliveryDate: firstDay, selectedDeliveryDate: day, notice: "", marketPriceNotice: "", policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product:", productId: "product", promotionId: null, name: "합성 주문 품목", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: day === firstDay ? 1000 : 2000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
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
  let costRequests = 0;
  await page.route("**/api/store/costs**", route => { costRequests++; return route.abort(); });
  await page.goto("/store?fixture=store-cost-owner#synthetic-order-link");
  await expect(page.getByText("합성 최초 조회 실패")).toBeVisible();
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  if (width === 1440) await page.getByRole("button", { name: "격자형", exact: true }).click();
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
  await storeTab(page, "데이터").click();
  await expect(page.getByRole("status")).toContainText("로그인한 매장의 전용 주소");
  await expect(page.getByRole("button", { name: "엑셀 원가 업로드", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "매장 카카오 로그인", exact: false })).toHaveCount(0);
  expect(costRequests).toBe(0);
  await storeTab(page, "내역").click();
  await expect(page.getByText("아직 주문이 없습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText("주문 당시 품목", { exact: false })).toHaveCount(0);
  await storeTab(page, "주문").click();
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
  if (width === 1440) await page.getByRole("button", { name: "격자형", exact: true }).click();
  await page.getByRole("button", { name: "합성 주문 품목 수량 늘리기" }).click();
  await page.evaluate(() => { window.location.hash = "synthetic-revoked-link"; });
  await expect(page.getByText(/사용할 수 없는 매장 링크입니다/)).toBeVisible();
  await expect(page.getByText("두 번째 매장", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toHaveCount(0);
  expect(saved.size).toBe(1);
  expect(costRequests).toBe(0);

});


for (const width of [1440, 390]) test(`CX-74 server-clock cutoff closes without losing cart at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  // The phone clock is intentionally years ahead of the verified server clock.
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  let serverNow = '2026-11-18T12:59:00Z', saved = false;
  const submissions: Record<string, unknown>[] = [];
  const firstDay = '2026-11-19', nextDay = '2026-11-20';
  const response = (day: string, enabled: boolean) => ({
    ...(enabled ? { orderCutoffGuidance: { serverNow } } : {}), mobileCommon: true,
    store: { title: 'CX-74 synthetic sheet', companyName: enabled ? 'Synthetic distributor A' : 'Synthetic distributor B', customerName: 'Synthetic store',
      deliveryAddress: 'Synthetic address', version: 1, validUntil: '2099-12-31', priceAvailable: true, canOrder: true,
      nextDeliveryDate: firstDay, selectedDeliveryDate: day, notice: '', marketPriceNotice: '',
      policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 1, cutoffTime: '22:00', minimumAmount: 0, minimumPolicy: 'notice', deliveryFee: 0 },
      lines: [{ key: 'product:', productId: 'product', promotionId: null, name: 'Synthetic product', category: 'Test', brand: '', spec: '1kg', unit: 'BOX',
        badge: '', taxType: 'exempt', unitPrice: 1200, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
    preferences: [], orders: saved && enabled ? [{ id: 'order', deliveryDate: nextDay, status: 'submitted', knownTotal: 1200, requestMemo: '', marketPricePending: false,
      submittedAt: serverNow, revision: 1, lines: [{ product_id: 'product', promotion_id: null, product_name: 'Synthetic product', quantity: 1, unit_price: 1200, total_amount: 1200 }] }] : [],
    historyPage: 1, historyHasMore: false,
  });
  await page.route('**/api/storefront', async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === 'PUT') {
      submissions.push(body);
      if (submissions.length === 1) return route.fulfill({ status: 409, json: { message: 'Synthetic server cutoff recheck rejected this request.' } });
      saved = true; return route.fulfill({ json: { id: 'order', revision: 1, knownTotal: 1200 } });
    }
    return route.fulfill({ json: response(body.deliveryDate || firstDay, body.token !== 'synthetic-cutoff-off') });
  });
  await page.goto('/store#synthetic-cutoff');
  await page.getByRole('button', { name: '주문하기', exact: true }).click();
  const banner = page.getByRole('region', { name: '주문 마감 안내' });
  await expect(banner).toContainText('2026-11-18 22:00');
  await expect(banner).toContainText('1분 남음');
  if (width === 1440) await page.getByRole('button', { name: '격자형', exact: true }).click();
  await page.getByRole('button', { name: 'Synthetic product 수량 늘리기', exact: true }).click();
  if (width === 390) await page.getByRole('button', { name: '장바구니 확인 · 1개 품목', exact: true }).click();
  const submit = page.getByRole('button', { name: '후결제로 주문 신청', exact: true });
  await expect(submit).toBeEnabled();
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.clock.fastForward(61_000);
  await expect(submit).toBeDisabled();
  expect(submissions).toHaveLength(0);
  if (width === 390) {
    await expect(page.getByRole('dialog', { name: '장바구니' }).getByRole('region', { name: '주문 마감 안내' })).toContainText('주문 마감이 지났습니다');
    await page.getByRole('dialog', { name: '장바구니' }).getByRole('button', { name: '닫기', exact: true }).click();
  }
  await expect(banner).toContainText('주문 마감이 지났습니다');
  await expect(page.getByLabel('Synthetic product 수량', { exact: true })).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({ path: info.outputPath(`cx74-cutoff-closed-${width}.png`), fullPage: true });
  serverNow = '2026-11-18T13:01:00Z';
  await page.getByLabel('배송일', { exact: true }).fill(nextDay);
  await expect(banner).toContainText('2026-11-19 22:00');
  await expect(page.getByLabel('Synthetic product 수량', { exact: true })).toHaveText('1');
  if (width === 390) await page.getByRole('button', { name: '장바구니 확인 · 1개 품목', exact: true }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('Synthetic server cutoff recheck rejected this request.', { exact: true })).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('주문을 받았습니다. 주문 내역에서 확인해 주세요.', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  expect(submissions[0]).toMatchObject({ deliveryDate: nextDay, lines: [{ productId: 'product', promotionId: null, quantity: 1 }] });
  expect(submissions[0]).not.toHaveProperty('knownTotal');
  expect(submissions[0]).not.toHaveProperty('companyId');
  await page.evaluate(() => { window.location.hash = 'synthetic-cutoff-off'; });
  await expect(page.getByText('Synthetic distributor B · Synthetic store', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '주문하기', exact: true }).click();
  await expect(page.getByRole('region', { name: '주문 마감 안내' })).toHaveCount(0);
});


for (const width of [1440, 390]) test(`CX-74 confirms a lost order response after cutoff without another order at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time: new Date('2026-11-18T12:59:00Z') });
  const day = '2026-11-19';
  const submitted: Record<string, unknown>[] = [];
  let stored: Record<string, unknown> | null = null, writes = 0;
  await page.route('**/api/storefront', async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === 'PUT') {
      submitted.push(body);
      if (!stored) { stored = body; writes++; return route.abort('failed'); }
      expect(body).toEqual(stored);
      return route.fulfill({ json: { id: 'stored-order', revision: 1, knownTotal: 1200 } });
    }
    return route.fulfill({ json: {
      orderCutoffGuidance: { serverNow: '2026-11-18T12:59:00Z' }, mobileCommon: true,
      store: { title: 'Synthetic confirmation sheet', companyName: 'Synthetic distributor', customerName: 'Synthetic store', deliveryAddress: 'Synthetic address',
        version: 1, validUntil: '2099-12-31', priceAvailable: true, canOrder: true, nextDeliveryDate: day, selectedDeliveryDate: day, notice: '', marketPriceNotice: '',
        policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 1, cutoffTime: '22:00', minimumAmount: 0, minimumPolicy: 'notice', deliveryFee: 0 },
        lines: [{ key: 'product:', productId: 'product', promotionId: null, name: 'Retry product', category: 'Test', brand: '', spec: '1kg', unit: 'BOX', badge: '',
          taxType: 'exempt', unitPrice: 1200, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
      orders: stored ? [{ id: 'stored-order', deliveryDate: day, status: 'submitted', knownTotal: 1200, requestMemo: '', marketPricePending: false,
        submittedAt: '2026-11-18T12:59:00Z', revision: 1, lines: [{ product_id: 'product', promotion_id: null, product_name: 'Retry product', quantity: 1, unit_price: 1200, total_amount: 1200 }] }] : [],
      preferences: [], historyPage: 1, historyHasMore: false,
    } });
  });
  await page.goto('/store#synthetic-cutoff-confirmation');
  await page.getByRole('button', { name: '주문하기', exact: true }).click();
  if (width === 1440) await page.getByRole('button', { name: '격자형', exact: true }).click();
  await page.getByRole('button', { name: 'Retry product 수량 늘리기', exact: true }).click();
  if (width === 390) await page.getByRole('button', { name: '장바구니 확인 · 1개 품목', exact: true }).click();
  const submit = page.getByRole('button', { name: '후결제로 주문 신청', exact: true });
  await expect(submit).toBeEnabled(); await submit.click();
  await expect.poll(() => submitted.length).toBe(1);
  await expect(submit).toBeEnabled();
  await page.clock.fastForward(61_000);
  const confirm = page.getByRole('button', { name: '이전 주문 결과 확인', exact: true });
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('region', { name: '주문 마감 안내' })).toContainText('이미 보낸 주문의 결과');
  await confirm.click();
  await expect(page.getByText('주문을 받았습니다. 주문 내역에서 확인해 주세요.', { exact: true })).toBeVisible();
  expect(submitted).toHaveLength(2); expect(submitted[0]).toEqual(submitted[1]); expect(writes).toBe(1);
});

for (const width of [1440, 390]) test(`CX-74 adjusted promotion remaining and lost-response confirmation at ${width}px`, async ({ page }, info) => {
  test.setTimeout(60000); page.setDefaultTimeout(10000);
  await page.setViewportSize({ width, height: 900 });
  const day = '2099-01-05';
  const ids = [1,2,3,4].map(n => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  let state: 'ready' | 'unknown' | 'exhausted' = 'ready', writes = 0;
  const submitted: Record<string, unknown>[] = [];
  const response = (enabled: boolean) => ({ mobileCommon: true,
    ...(enabled ? { promotionAvailability: {
      [ids[0]]: state === 'unknown' ? { state: 'unavailable' } : { state: 'known', remaining: state === 'exhausted' ? 0 : 6.875, storeLimit: 4 },
      [ids[1]]: { state: 'known', remaining: 0, storeLimit: 2 },
      [ids[2]]: { state: 'known', remaining: null, storeLimit: null }, [ids[3]]: { state: 'unavailable' },
    } } : {}),
    store: { title: '행사 잔량 합성 문서', companyName: enabled ? '합성 유통 A' : '합성 유통 B', customerName: '합성 매장',
      deliveryAddress: '합성 주소', version: 1, validUntil: '2099-12-31', priceAvailable: true, canOrder: true,
      nextDeliveryDate: day, selectedDeliveryDate: day, notice: '', marketPriceNotice: '',
      policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 0, cutoffTime: '23:59', minimumAmount: 0, minimumPolicy: 'notice', deliveryFee: 0 },
      lines: ids.map((id, i) => ({ key: `product${i}:${id}`, productId: `product${i}`, promotionId: id, name: ['잔량 행사', '품절 행사', '무제한 행사', '미확인 행사'][i],
        category: '합성', brand: '', spec: '1kg', unit: 'BOX', badge: '행사', taxType: 'exempt', unitPrice: 1200, priceIncludesTax: false,
        isMarketPrice: false, remaining: 999, maximumQuantity: 999, recentDispatchPrice: null, recentDispatchDate: null })) },
    orders: [], preferences: [], historyPage: 1, historyHasMore: false,
  });
  await page.route('**/api/storefront', async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === 'PUT') {
      submitted.push(body);
      if (submitted.length === 1) { writes++; state = 'exhausted'; return route.abort('failed'); }
      expect(body).toEqual(submitted[0]);
      return route.fulfill({ json: { result: { id: 'same-order', revision: 1 } } });
    }
    return route.fulfill({ json: response(body.token !== 'synthetic-promo-off') });
  });
  await page.goto('/store#synthetic-promo');
  await page.getByRole('button', { name: '주문하기', exact: true }).click();
  if (width === 1440) {
    await expect(page.getByRole('columnheader').filter({ hasText: '행사 수량' })).toBeVisible();
    await expect(page.getByText('행사 남은 수량 6.875BOX', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '격자형', exact: true }).click();
  }
  await expect(page.getByText('행사 남은 수량 6.875BOX', { exact: true })).toBeVisible();
  await expect(page.getByText('매장당 총 한도 4BOX · 기존 주문 포함', { exact: true })).toBeVisible();
  await expect(page.getByText('행사 수량 제한 없음', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '품절 행사 수량 늘리기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '미확인 행사 수량 늘리기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '무제한 행사 수량 늘리기', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '잔량 행사 수량 늘리기', exact: true }).click();
  await page.getByRole('button', { name: '잔량 행사 수량 늘리기', exact: true }).click();
  const refresh = page.getByRole('region', { name: '행사 잔량 확인', exact: true }).getByRole('button', { name: '행사 잔량 다시 확인', exact: true });
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  state = 'unknown'; await refresh.click();
  await expect(page.getByRole('button', { name: '잔량 행사 수량 늘리기', exact: true })).toBeDisabled();
  await expect(page.getByLabel('잔량 행사 수량', { exact: true })).toHaveText('2');
  if (width === 390) await page.getByRole('button', { name: '장바구니 확인 · 1개 품목', exact: true }).click();
  await expect(page.getByRole('button', { name: '후결제로 주문 신청', exact: true })).toBeDisabled();
  expect(submitted).toHaveLength(0);
  if (width === 390) await page.keyboard.press('Escape');
  state = 'ready'; await refresh.click();
  if (width === 390) await page.getByRole('button', { name: '장바구니 확인 · 1개 품목', exact: true }).click();
  await page.getByRole('button', { name: '후결제로 주문 신청', exact: true }).click();
  const confirm = page.getByRole('button', { name: '이전 주문 결과 확인', exact: true });
  await expect(confirm).toBeEnabled();
  const cart = width === 390 ? page.getByRole('dialog', { name: '장바구니', exact: true }) : page.getByRole('complementary', { name: '장바구니', exact: true });
  await cart.getByRole('button', { name: '행사 잔량 다시 확인', exact: true }).first().click();
  await expect(cart.getByText('행사 남은 수량 0BOX', { exact: true })).toBeVisible();
  await expect(confirm).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`promotion-remaining-${width}.png`), fullPage: true });
  await confirm.click();
  await expect(page.getByText('주문을 받았습니다. 주문 내역에서 확인해 주세요.', { exact: true })).toBeVisible();
  expect(submitted).toHaveLength(2); expect(submitted[0]).toEqual(submitted[1]); expect(writes).toBe(1);
  expect(submitted[0]).not.toHaveProperty('knownTotal'); expect(submitted[0]).not.toHaveProperty('remaining');
  await page.goto('/store#synthetic-promo-off');
  await page.getByRole('button', { name: '주문하기', exact: true }).click();
  await expect(page.getByRole('region', { name: '행사 잔량 확인', exact: true })).toHaveCount(0);
  await expect(page.getByText('행사 남은 수량 6.875BOX', { exact: true })).toHaveCount(0);
});
