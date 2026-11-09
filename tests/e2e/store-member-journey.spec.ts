import { expect, test } from "@playwright/test";
import { documentDisplayPrice, lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";
import { publicDocumentOutput } from "../../domains/pricing/document-share";

for (const width of [1440, 390]) for (const role of ["owner", "manager", "staff"] as const) for (const kind of ["sheet", "quote"] as const) test(`shared ${kind} document to ${role} first order history at ${width}px`, async ({ page, context }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  const companyId = "00000000-0000-4000-8000-000000000001", accountId = "30000000-0000-4000-8000-000000000001";
  const productId = "50000000-0000-4000-8000-000000000001", deliveryDate = "2099-01-05";
  const author = { owner: "합성 점주 · 점주", manager: "합성 관리자 · 관리자", staff: "합성 직원 · 직원" }[role];
  const taxType = kind === "quote" ? "taxable" : "exempt";
  const unitPrice = documentDisplayPrice(1000, taxType, true);
  const content: DocumentContent = { kind, title: "합성 연결 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [], productWidth: 65, priceIncludesTax: true },
    lines: [lineFromCatalog({ id: productId, name: "합성 품목", displayName: "합성 품목", brand: "", spec: "1kg", unit: "봉", price: 1000, taxType })] };
  const document = publicDocumentOutput({ id: "version", documentId: "document", version: 1, revision: 1, publishedAt: "2026-11-08T00:00:00Z", content, unavailablePromotions: [] });
  let signedIn = false, revoked = false, accepted = 0, orderAttempts = 0, costRequests = 0, lostResponse = false;
  let deliveryConfigured = false, failDeliveryRefresh = true;
  const orderSnapshot = { id: "synthetic-order", deliveryDate, status: "submitted", knownTotal: unitPrice, requestMemo: "", marketPricePending: false,
    submittedAt: "2026-11-08T00:00:00Z", revision: 1, authorLabel: author,
    lines: [{ product_id: productId, promotion_id: null, product_name: content.lines[0].displayName, quantity: 1,
      sales_unit: content.lines[0].unit, specification: content.lines[0].spec, tax_type: taxType, unit_price: unitPrice, total_amount: unitPrice }] };
  const saved = new Map<string, typeof orderSnapshot>();
  const requests: Record<string, unknown>[] = [];
  let releaseOrderResponse = () => {};
  await page.route("**/api/pricing-documents/public", route => route.fulfill({ json: { document, expiresAt: "2099-01-01T00:00:00Z", acceptanceAvailable: true } }));
  await page.route("**/api/pricing-document-acceptance", route => {
    const input = route.request().postDataJSON();
    expect(Object.keys(input).sort()).toEqual(["idempotencyKey", "shareToken"]);
    expect(input.shareToken).toBe("synthetic-document-token"); accepted++;
    return route.fulfill({ json: { documentVersionId: "version", kind, needsReview: false, orderEnabled: true, storefrontToken: "synthetic-order-token" } });
  });
  // The OAuth boundary is synthetic. No provider request or real session is created.
  await context.route("**/api/auth/kakao/start?**", route => {
    const url = new URL(route.request().url());
    expect(Object.fromEntries(url.searchParams)).toEqual({ store: "1", companyId, storeAccountId: accountId });
    expect(url.toString()).not.toMatch(/synthetic-order-token|synthetic-document-token/);
    signedIn = true;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main>합성 카카오 인증 완료</main>" });
  });
  await context.route("**/api/store/costs**", route => { costRequests++; return route.abort(); });
  await page.route("**/api/storefront", async route => {
    const input = route.request().postDataJSON(); expect(input.token).toBe("synthetic-order-token");
    if (route.request().method() === "PUT") {
      orderAttempts++; requests.push(input);
      expect(input).not.toHaveProperty("memberId"); expect(input).not.toHaveProperty("authUserId"); expect(input).not.toHaveProperty("storeAccountId");
      expect(input.lines).toEqual([{ productId, promotionId: null, quantity: 1 }]);
      expect(input.deliveryDate).toBe(deliveryDate); expect(input.memo).toBe("");
      if (!signedIn) return route.fulfill({ status: 403, json: { message: "매장 구성원으로 로그인한 뒤 다시 주문해 주세요." } });
      if (revoked) return route.fulfill({ status: 403, json: { message: "매장 구성원 권한이 변경되었습니다. 다시 로그인해 주세요." } });
      expect(typeof input.idempotencyKey).toBe("string");
      if (!saved.has(input.idempotencyKey)) saved.set(input.idempotencyKey, structuredClone(orderSnapshot));
      if (!lostResponse) {
        lostResponse = true;
        await new Promise<void>(resolve => { releaseOrderResponse = resolve; });
        return route.fulfill({ status: 503, json: { message: "합성 주문 저장 후 응답 유실. 같은 요청으로 다시 시도해 주세요." } });
      }
      return route.fulfill({ json: { id: saved.get(input.idempotencyKey)!.id } });
    }
    expect(route.request().method()).toBe("POST");
    if (deliveryConfigured && failDeliveryRefresh) {
      failDeliveryRefresh = false;
      return route.fulfill({ status: 503, json: { message: "합성 배송 설정 확인 실패. 다시 확인해 주세요." } });
    }
    return route.fulfill({ json: { store: { title: "합성 매장 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: deliveryConfigured, nextDeliveryDate: deliveryConfigured ? deliveryDate : null, selectedDeliveryDate: deliveryDate, notice: "", marketPriceNotice: "",
      policy: { weekdays: deliveryConfigured ? [0,1,2,3,4,5,6] : [], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: [{ key: `${productId}:`, productId, promotionId: null, name: "합성 품목", category: "", brand: "", spec: "1kg", unit: "봉", badge: "", taxType, unitPrice, priceIncludesTax: true, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
      ...(!signedIn || revoked ? { memberLogin: { enabled: true, companyId, storeAccountId: accountId } } : {}),
      orders: Array.from(saved.values()), preferences: [], historyPage: 1, historyHasMore: false } });
  });
  await page.goto("/pricing-document#synthetic-document-token");
  await expect(page.getByRole("checkbox")).toBeVisible(); expect(accepted).toBe(0);
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "문서 수락 요청", exact: true }).click();
  await page.getByRole("link", { name: "주문 화면 열기", exact: true }).click();
  await expect(page).toHaveURL(/\/store#synthetic-order-token$/); expect(orderAttempts).toBe(0);
  await page.getByRole("button", { name: "내역", exact: true }).click();
  await expect(page.getByText("아직 주문이 없습니다.", { exact: true })).toBeVisible();
  expect(saved.size).toBe(0);
  // Even server-rendered cost privileges must stay isolated from a bearer order link.
  await page.goto(`/store?fixture=store-cost-${role}#synthetic-order-token`);
  await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true }).click();
  const deliveryGuide = page.getByRole("region", { name: "배송 요일 설정 안내", exact: true });
  await expect(deliveryGuide).toContainText("이 거래처의 배송 요일이 설정되지 않아 주문할 수 없습니다.");
  const refreshDelivery = page.getByRole("button", { name: "배송 설정 다시 확인", exact: true });
  expect((await refreshDelivery.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
  expect(orderAttempts).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(deliveryGuide).toBeInViewport();
  await page.screenshot({ path: info.outputPath(`delivery-settings-${kind}-${role}-${width}.png`), fullPage: true });
  deliveryConfigured = true;
  await refreshDelivery.click();
  await expect(page.getByText("합성 배송 설정 확인 실패. 다시 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
  await refreshDelivery.click();
  await expect(refreshDelivery).toHaveCount(0);
  await expect(page.getByLabel("합성 품목 수량", { exact: true })).toHaveText("1");
  expect(orderAttempts).toBe(0);
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "매장 구성원으로 로그인" })).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "카카오로 매장 로그인", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByText("합성 카카오 인증 완료")).toBeVisible(); await popup.close();
  await expect(page).toHaveURL(new RegExp(`/store\\?fixture=store-cost-${role}#synthetic-order-token$`));
  await page.getByRole("button", { name: "로그인 상태 다시 확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("button", { name: "저장 중", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "합성 품목 수량 줄이기", exact: true })).toBeDisabled();
  await expect(page.getByLabel("배송일", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("요청 사항", { exact: true })).toBeDisabled();
  await expect.poll(() => saved.size).toBe(1);
  releaseOrderResponse();
  await expect(page.getByRole("status").filter({ hasText: "합성 주문 저장 후 응답 유실" })).toBeVisible();
  await expect(page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true })).toBeEnabled();
  await expect(page.getByLabel("배송일", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("요청 사항", { exact: true })).toBeEnabled();
  expect(saved.size).toBe(1);
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  await expect(page.getByText(`작성자: ${author}`, { exact: true })).toBeVisible();
  expect(accepted).toBe(1); expect(orderAttempts).toBe(3); expect(saved.size).toBe(1);
  expect(requests[0]).toEqual(requests[1]); expect(requests[1]).toEqual(requests[2]);
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const history = page.locator("table tbody tr").first();
  await expect(history).toContainText("합성 품목 1봉");
  await expect(history).toContainText("1kg");
  await expect(history).toContainText(taxType === "exempt" ? "면세" : "과세");
  await expect(history).toContainText(`${unitPrice.toLocaleString("ko-KR")}원`);
  expect(document.lines[0].price).toBe(unitPrice);
  expect(Array.from(saved.values())[0]).toEqual(orderSnapshot);
  await page.getByRole("button", { name: "다시 담기", exact: true }).click();
  await expect(page.getByLabel("합성 품목 수량", { exact: true })).toHaveText("1");
  revoked = true;
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "구성원 권한이 변경" })).toBeVisible();
  const recheckMember = page.getByRole("button", { name: "로그인 상태 다시 확인", exact: true });
  expect((await recheckMember.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await recheckMember.click();
  await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toBeVisible();
  expect(saved.size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`member-journey-${kind}-${role}-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "데이터", exact: true }).click();
  await expect(page.getByText("현재 주문 링크에서는 원가 자료를 제공하지 않습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "엑셀 원가 업로드", exact: true })).toHaveCount(0);
  expect(costRequests).toBe(0);
});
