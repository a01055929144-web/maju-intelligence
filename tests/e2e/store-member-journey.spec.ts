import { expect, test } from "@playwright/test";
import { lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";
import { publicDocumentOutput } from "../../domains/pricing/document-share";

for (const width of [1440, 390]) for (const role of ["owner", "staff"] as const) test(`shared document to ${role} order history at ${width}px`, async ({ page, context }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  const companyId = "00000000-0000-4000-8000-000000000001", accountId = "30000000-0000-4000-8000-000000000001";
  const productId = "50000000-0000-4000-8000-000000000001", deliveryDate = "2099-01-05";
  const author = role === "owner" ? "합성 점주 · 점주" : "합성 직원 · 직원";
  const content: DocumentContent = { kind: "quote", title: "합성 연결 견적", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [], productWidth: 65, priceIncludesTax: true },
    lines: [lineFromCatalog({ id: productId, name: "합성 품목", displayName: "합성 품목", brand: "", spec: "1kg", unit: "봉", price: 1000, taxType: "exempt" })] };
  const document = publicDocumentOutput({ id: "version", documentId: "document", version: 1, revision: 1, publishedAt: "2026-11-08T00:00:00Z", content, unavailablePromotions: [] });
  let signedIn = false, accepted = 0, saved = false, orderAttempts = 0;
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/pricing-documents/public", route => route.fulfill({ json: { document, expiresAt: "2099-01-01T00:00:00Z", acceptanceAvailable: true } }));
  await page.route("**/api/pricing-document-acceptance", route => {
    expect(route.request().postDataJSON().shareToken).toBe("synthetic-document-token"); accepted++;
    return route.fulfill({ json: { documentVersionId: "version", kind: "quote", needsReview: false, orderEnabled: true, storefrontToken: "synthetic-order-token" } });
  });
  // The OAuth boundary is synthetic. No provider request or real session is created.
  await context.route("**/api/auth/kakao/start?**", route => {
    const url = new URL(route.request().url());
    expect(Object.fromEntries(url.searchParams)).toEqual({ store: "1", companyId, storeAccountId: accountId });
    expect(url.toString()).not.toMatch(/synthetic-order-token|synthetic-document-token/);
    signedIn = true;
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main>합성 카카오 인증 완료</main>" });
  });
  await page.route("**/api/storefront", route => {
    const input = route.request().postDataJSON(); expect(input.token).toBe("synthetic-order-token");
    if (route.request().method() === "PUT") {
      orderAttempts++; requests.push(input);
      expect(input).not.toHaveProperty("memberId"); expect(input).not.toHaveProperty("authUserId"); expect(input).not.toHaveProperty("storeAccountId");
      expect(input.lines).toEqual([{ productId, promotionId: null, quantity: 1 }]);
      if (!signedIn) return route.fulfill({ status: 403, json: { message: "매장 구성원으로 로그인한 뒤 다시 주문해 주세요." } });
      saved = true; return route.fulfill({ json: { id: "synthetic-order" } });
    }
    expect(route.request().method()).toBe("POST");
    return route.fulfill({ json: { store: { title: "합성 매장 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, nextDeliveryDate: deliveryDate, selectedDeliveryDate: deliveryDate, notice: "", marketPriceNotice: "",
      policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: [{ key: `${productId}:`, productId, promotionId: null, name: "합성 품목", category: "", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: true, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
      ...(!signedIn ? { memberLogin: { enabled: true, companyId, storeAccountId: accountId } } : {}),
      orders: saved ? [{ id: "synthetic-order", deliveryDate, status: "submitted", knownTotal: 1000, requestMemo: "", marketPricePending: false, submittedAt: "2026-11-08T00:00:00Z", revision: 1, authorLabel: author,
        lines: [{ product_id: productId, promotion_id: null, product_name: "합성 품목", quantity: 1, sales_unit: "봉", specification: "1kg", tax_type: "exempt", unit_price: 1000, total_amount: 1000 }] }] : [], preferences: [], historyPage: 1, historyHasMore: false } });
  });
  await page.goto("/pricing-document#synthetic-document-token");
  await expect(page.getByRole("checkbox")).toBeVisible(); expect(accepted).toBe(0);
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "문서 수락 요청", exact: true }).click();
  await page.getByRole("link", { name: "주문 화면 열기", exact: true }).click();
  await expect(page).toHaveURL(/\/store#synthetic-order-token$/); expect(orderAttempts).toBe(0);
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true }).click();
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "매장 구성원으로 로그인" })).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "카카오로 매장 로그인", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByText("합성 카카오 인증 완료")).toBeVisible(); await popup.close();
  await expect(page).toHaveURL(/\/store#synthetic-order-token$/);
  await page.getByRole("button", { name: "로그인 상태 다시 확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  await expect(page.getByText(`작성자: ${author}`, { exact: true })).toBeVisible();
  expect(accepted).toBe(1); expect(orderAttempts).toBe(2); expect(requests[0]).toEqual(requests[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`member-journey-${role}-${width}.png`), fullPage: true });
});
