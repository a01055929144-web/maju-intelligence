import { expect, test } from "@playwright/test";
import { storeTab } from "./store-tab";

// CC-36c-2b: 전체 상품 링크로 들어온 점주가 검색 → 담기(일반·시세 품목) → 주문. 서버 응답은 가짜(합성) 데이터로 대체한다.
const store = {
  source: "catalog", title: "전체 상품", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 0,
  validUntil: "2099-12-31", priceAvailable: true, canOrder: true, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0, 1, 2, 3, 4, 5, 6] },
  nextDeliveryDate: "2099-01-01", selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "싯가·경매가에 따라 달라질 수 있습니다.",
  policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [],
};
const base = { store, orders: [], preferences: [], historyPage: 1, historyHasMore: false };
const line = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ productId: id, name, category: "합성분류", brand: "", spec: "1kg", unit: "개", isMarket: false, taxType: "exempt", price: 1000, todayBasePrice: null, lastDispatch: null, ...extra });
const page1 = { lines: [line("p1", "합성 양파"), line("p2", "합성 대파", { price: 2000 }), line("m1", "합성 시세생선", { isMarket: true, price: null, lastDispatch: { price: 5800, date: "2098-12-31" } })], page: 1, hasMore: true, marketPriceNotice: store.marketPriceNotice };
const page2 = { lines: [line("p3", "합성 마늘", { price: 3000 })], page: 2, hasMore: false, marketPriceNotice: store.marketPriceNotice };

for (const width of [1440, 390]) test(`전체 상품 링크: 검색·담기·주문 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let order: { lines: Array<Record<string, unknown>>; deliveryDate: string } | null = null;
  const catalogCalls: Array<{ page: number; q: string }> = [];
  await page.route("**/api/storefront/catalog", async (route) => {
    const body = route.request().postDataJSON() as { page: number; q: string };
    catalogCalls.push({ page: body.page, q: body.q });
    await route.fulfill({ json: body.q === "마늘" ? { ...page2, page: 1 } : body.page === 2 ? page2 : page1 });
  });
  await page.route("**/api/storefront", async (route) => {
    if (route.request().method() === "PUT") { order = route.request().postDataJSON(); return route.fulfill({ json: { result: { id: "o1", revision: 1 } } }); }
    return route.fulfill({ json: base });
  });
  await page.goto("/store#synthetic-catalog-token");
  await storeTab(page, "주문").click();

  await expect(page.getByText("합성 양파", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "즐겨찾기" })).toHaveCount(0); // 전체 상품 링크에는 품목 설정이 없다
  await expect(page.getByText("최근 출고 12-31", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "합성 양파 수량 늘리기" }).click();
  await page.getByRole("button", { name: "합성 시세생선 수량 늘리기" }).click();
  await page.getByRole("button", { name: "상품 더 보기" }).click();
  await page.getByRole("button", { name: "합성 마늘 수량 늘리기" }).click();
  await page.getByRole("button", { name: "합성 마늘 수량 늘리기" }).click();

  // 검색으로 목록이 바뀌어도 담은 품목은 유지된다.
  await page.getByLabel("상품 검색").fill("마늘");
  await expect(page.getByText("합성 양파", { exact: true })).toHaveCount(0);
  await expect(page.getByText("확정된 품목 합계 7,000원")).toBeVisible(); // 1,000 + 3,000×2 (시세 품목은 가격 미정)
  await expect(page.getByText("시세 품목 1개는 가격 확정 후")).toBeVisible();

  await page.getByRole("button", { name: "후결제로 주문 신청" }).click();
  await expect(page.getByText("주문을 받았습니다")).toBeVisible();
  expect(order!.deliveryDate).toBe("2099-01-01");
  expect(order!.lines.map((l) => [l.productId, l.quantity]).sort()).toEqual([["m1", 1], ["p1", 1], ["p3", 2]]);
  expect(order!.lines.every((l) => !("unitPrice" in l))).toBe(true); // 단가는 서버가 다시 계산 — 보내지 않는다
  expect(catalogCalls.some((c) => c.q === "마늘")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});
