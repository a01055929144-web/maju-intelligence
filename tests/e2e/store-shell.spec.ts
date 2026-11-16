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

for (const width of [1440, 390]) {
  test(`S-3 received documents stay inside the store at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/storefront", route => route.fulfill({ json: {
      ...storefront, store: { ...storefront.store, title: "합성 주문 문서", canOrder: true },
    } }));
    await page.route("**/api/pricing-documents/public", route => route.fulfill({ json: {
      expiresAt: "2099-12-31T15:00:00Z",
      document: {
        title: "합성 공유 문서", companyName: "합성 유통", kind: "sheet", layout: "table",
        publishedAt: "2026-11-16T00:00:00Z", validUntil: "2099-12-31", version: 1, expired: false,
        display: { columns: 1, info: [], productWidth: 65, promoLayout: "table" }, lines: [],
      },
      orderEntry: { available: true, companyName: "합성 유통", title: "합성 공유 문서", version: 1,
        ...(route.request().postDataJSON().token === "synthetic-returning-member" ? { member: true } : {}) },
    } }));
    await page.route("**/api/pricing-documents/order-intent", () => { throw new Error("A received document cannot start signup"); });
    await page.goto("/store?fixture=s1-single");
    const nav = page.getByRole("navigation", { name: width === 390 ? "매장 메뉴" : "주요 작업공간" });
    await page.getByRole("link", { name: /합성 공유 문서/ }).click();
    await expect(page.getByRole("heading", { name: "공유 문서", exact: true })).toBeVisible();
    await expect(page.getByText("합성 공유 문서", { exact: true })).toBeVisible();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "주문·점주 가입 시작" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "이 단가표로 주문하기" })).toHaveAttribute("href", "/store?view=order&fixture=s1-single");
    expect(new URL(page.url()).pathname).toBe("/store");
    expect(new URL(page.url()).hash).toBe("");
    await page.screenshot({ path: info.outputPath(`S-3-shared-${width}.png`) });
    await page.getByRole("link", { name: "받은 문서 목록" }).click();
    await page.getByRole("link", { name: /합성 주문 문서/ }).click();
    await expect(page.getByRole("heading", { name: "합성 주문 문서" })).toBeVisible();
    await expect(page.getByText("18L · 통", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "이 단가표로 주문하기" })).toHaveAttribute("href", "/store?view=order#synthetic-s1-order");
    await nav.getByRole("link", { name: "주문", exact: true }).click();
    await expect(page.getByRole("heading", { name: "주문", exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/document=/);
    await page.goto("/store?fixture=s1-multi&view=home&companyId=00000000-0000-4000-8000-000000000001&storeAccountId=20000000-0000-4000-8000-000000000002&document=shared-synthetic-s3-share");
    await expect(page.getByRole("alert").filter({ hasText: "받은 문서를 사용할 수 없습니다." })).toBeVisible();
    await page.goto("/pricing-document#synthetic-returning-member");
    await expect(page.getByRole("link", { name: "이 단가표로 주문하기" })).toHaveAttribute("href", "/store?view=order");
    await expect(page.getByRole("button", { name: "주문·점주 가입 시작" })).toHaveCount(0);
  });
}

for (const width of [1440, 390]) {
  test(`S-5 token order uses the shared PC table and keeps the cart at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const product = storefront.store.lines[0];
    const market = { ...product, key: "market", productId: "market", name: "합성 시가 품목", unitPrice: null, isMarketPrice: true };
    let submits = 0;
    await page.route("**/api/storefront", route => {
      if (route.request().method() === "PUT") {
        submits++;
        return route.fulfill({ status: 503, json: { message: "합성 주문 실패" } });
      }
      return route.fulfill({ json: {
        ...storefront, store: { ...storefront.store, canOrder: true,
          policy: { ...storefront.store.policy, weekdays: [0, 1, 2, 3, 4, 5, 6] }, lines: [product, market] },
      } });
    });
    await page.goto("/store?view=order#synthetic-s5-token");
    const cart = page.getByRole("complementary", { name: "장바구니" });
    await expect(cart).toBeVisible();
    if (width === 1440) {
      const table = page.getByRole("table");
      const amount = table.getByRole("textbox", { name: "합성 미림 수량" });
      await amount.fill("2");
      await amount.press("Enter");
      await expect(table.getByRole("textbox", { name: "합성 시가 품목 수량" })).toBeFocused();
      await table.getByRole("textbox", { name: "합성 시가 품목 수량" }).fill("1");
      await table.getByRole("textbox", { name: "합성 시가 품목 수량" }).press("Tab");
      await expect(table.locator("tfoot")).toContainText("2,000원");
      await expect(table.locator("tfoot")).toContainText("표 합계에서 시가 1줄 제외");
      await expect(table.getByText("배송 때 확정")).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /유통사/ })).toBeVisible();
      await page.getByRole("button", { name: "열 편집" }).click();
      const edit = page.getByText("유통사", { exact: true }).locator("..").getByRole("checkbox");
      await edit.uncheck();
      await expect(table.getByRole("columnheader", { name: /유통사/ })).toHaveCount(0);
      await page.getByRole("button", { name: "열 편집" }).click();
    } else {
      await expect(page.getByRole("table")).toHaveCount(0);
      const plus = page.getByRole("button", { name: "합성 미림 수량 늘리기" });
      await plus.click();
      await plus.click();
      expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(cart).toContainText("합성 미림 · 2통");
    await expect(cart).toContainText("확정된 품목 합계 2,000원");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
    await page.screenshot({ path: info.outputPath(`S-5-order-${width}.png`) });
    await cart.getByRole("button", { name: "후결제로 주문 신청" }).click();
    await expect(page.getByRole("status").filter({ hasText: "합성 주문 실패" })).toBeVisible();
    await expect(cart).toContainText("합성 미림 · 2통");
    expect(submits).toBe(1);
  });
}
