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

for (const width of [1440, 390]) {
  test(`S-1 member menus open without a storefront token at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/storefront", () => { throw new Error("Member views must not request a storefront token"); });
    await page.route("**/api/store/costs?**", route => {
      const query = new URL(route.request().url()).searchParams;
      expect(query.get("companyId")).toBe("00000000-0000-4000-8000-000000000001");
      expect(query.get("storeAccountId")).toBe("20000000-0000-4000-8000-000000000001");
      return route.fulfill({ json: { rows: [], hasMore: false, nextOffset: null } });
    });
    await page.route("**/api/store/information?**", route => route.fulfill({ json: {
      businessRegistrationNumber: "0000000000", canEdit: true, phone: "",
      representativeName: "합성 점주", storeName: "합성 가 매장",
    } }));
    await page.goto("/store?fixture=store-portal-source-document");
    await expect(page.getByText("합성 공개 가입 매장", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`S-1-before-${width}.png`) });
    await page.goto("/store?fixture=s1-single");
    const nav = page.getByRole("navigation", { name: width === 390 ? "매장 메뉴" : "주요 작업공간" });
    await expect(page.getByRole("heading", { name: "홈", exact: true })).toBeVisible();
    for (const [label, evidence] of [
      ["주문", "합성 주문 문서 · 주문하기"], ["주문 내역", "접수됨 · 11,100원"],
      ["데이터", "매장 원가관리"], ["매장 정보", "구성원 관리"],
    ]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
      await expect(page.getByText(evidence, { exact: true })).toBeVisible();
      expect(new URL(page.url()).hash).toBe("");
      expect(new URL(page.url()).searchParams.has("storeAccountId")).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
      await page.screenshot({ path: info.outputPath(`S-1-${new URL(page.url()).searchParams.get("view")}-${width}.png`) });
    }
    await nav.getByRole("link", { name: "홈", exact: true }).click();
    await expect(page.getByRole("heading", { name: "홈", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`S-1-home-${width}.png`) });
  });

  test(`S-1 multi-store member selects and remembers an allowed account at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/store?fixture=s1-multi&view=history");
    const picker = page.getByRole("region", { name: "매장 고르기" });
    await expect(picker).toBeVisible();
    await picker.getByRole("link", { name: "합성 나 매장" }).click();
    await expect(page.getByText("접수됨 · 22,200원")).toBeVisible();
    await expect(page.getByText("접수됨 · 11,100원")).toHaveCount(0);
    await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name === "maju_store_choice")).toBe(true);
    await page.goto("/store?fixture=s1-multi&view=history");
    await expect(page.getByText("접수됨 · 22,200원")).toBeVisible();
    await page.goto("/store?fixture=s1-multi&view=history&companyId=00000000-0000-4000-8000-000000000001&storeAccountId=20000000-0000-4000-8000-000000000099");
    await expect(picker).toBeVisible();
    await expect(page.getByText("접수됨 · 22,200원")).toHaveCount(0);
  });
}
