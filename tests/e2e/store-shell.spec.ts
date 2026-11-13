import { expect, test } from "@playwright/test";

// CX-11: 매장 PC 셸(사이드바·제목줄). 휴대폰(≤640px)은 기존 하단 탭을 그대로 쓴다.
const storefront = {
  store: { title: "합성 공개 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0, 1, 2, 3, 4, 5, 6] }, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product", productId: "product", promotionId: null, name: "합성 미림", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
  orders: [], preferences: [], historyPage: 1, historyHasMore: false,
};

for (const width of [1440, 1920, 390]) test(`store shell navigation keeps token and query at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/storefront", (route) => route.fulfill({ json: storefront }));
  await page.goto("/store?keep=1#synthetic-shell-token");
  const phone = width <= 640;
  const sidebar = page.getByRole("link", { name: "주문", exact: true });
  const bottomTab = page.getByRole("navigation", { name: "매장 메뉴" });
  if (phone) {
    await expect(sidebar).toHaveCount(0);
    await expect(bottomTab).toBeVisible();
    await bottomTab.getByRole("button", { name: "주문", exact: true }).click();
  } else {
    await expect(bottomTab).toBeHidden();
    await expect(sidebar).toBeVisible();
    await sidebar.click();
  }
  // 사이드바 이동은 ?view=를 붙이고, 하단 탭은 주소를 건드리지 않는다. 어느 쪽이든 기존 쿼리와 #토큰은 남는다(토큰이 사라지면 매장 인증이 풀린다).
  await expect(page).toHaveURL(phone ? /\/store\?keep=1#synthetic-shell-token$/ : /\/store\?(?=.*keep=1)(?=.*view=order).*#synthetic-shell-token$/);
  await expect(page.getByText("18L · 통", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});
