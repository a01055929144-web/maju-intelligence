import { expect, test } from "@playwright/test";

test("CX-153 mobile order moves through cart, confirmation, and receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const payload = {
    mobileOrderPages: true,
    store: {
      title: "합성 모바일 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "서울 마포구 합성로 1 2층",
      version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, nextDeliveryDate: "2099-01-05", selectedDeliveryDate: "2099-01-05",
      deliveryGuide: "오늘 주문하면 내일 배송", deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      notice: "", marketPriceNotice: "", policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "23:59", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: [{ key: "product:", productId: "product", promotionId: null, name: "합성 양파", category: "농산", brand: "", spec: "10kg", unit: "망", badge: "", taxType: "exempt", unitPrice: 12000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }],
    },
    deliveryEdit: { companyId: "00000000-0000-4000-8000-000000000001", storeAccountId: "20000000-0000-4000-8000-000000000001" },
    orders: [] as Array<{ id: string; deliveryDate: string; status: string; knownTotal: number; requestMemo: string; marketPricePending: boolean; submittedAt: string; revision: number; lines: unknown[] }>, preferences: [], historyPage: 1, historyHasMore: false,
  };
  let submitted = 0;
  await page.route("**/api/storefront", route => {
    if (route.request().method() === "PUT") {
      submitted++;
      payload.orders = [{ id: "CX153-ORDER-1", deliveryDate: "2099-01-05", status: "submitted", knownTotal: 12000, requestMemo: "", marketPricePending: false, submittedAt: "2099-01-01T00:00:00Z", revision: 1, lines: [] }];
      return route.fulfill({ json: { result: { id: "CX153-ORDER-1" } } });
    }
    return route.fulfill({ json: payload });
  });

  await page.goto("/store#synthetic-cx153");
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: "합성 양파 수량 늘리기" }).click();
  await expect(page.getByRole("button", { name: /장바구니 1품목 · 12,000원 · 보기/ })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await page.getByRole("button", { name: /장바구니 1품목 · 12,000원 · 보기/ }).click();
  await expect(page.getByRole("region", { name: "장바구니" })).toContainText("합성 양파");
  await page.getByRole("button", { name: "주문 확인으로" }).click();
  await expect(page.getByRole("region", { name: "주문 확인" })).toContainText("서울 마포구 합성로 1 2층");
  await expect(page.getByRole("region", { name: "주문 확인" })).toContainText("합계 12,000원");
  await page.getByRole("button", { name: "주문 접수" }).click();
  await expect(page.getByRole("region", { name: "접수 완료" })).toContainText("CX153-ORDER-1");
  await expect(page.getByRole("region", { name: "접수 완료" })).toContainText("12,000원");
  await page.getByRole("button", { name: "배송 현황 보기" }).click();
  await expect(page.getByRole("region", { name: "배송 확인" })).toContainText("CX153-ORDER-1");
  await expect(page.getByRole("listitem", { current: "step" })).toHaveText("접수됨");
  expect(submitted).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
});
