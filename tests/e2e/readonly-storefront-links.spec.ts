import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`explicit readonly issuance never enables store ordering at ${width}px`, async ({ page, context }, info) => {
  page.setDefaultTimeout(15_000); await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  let created = false, revoked = false, creates = 0, storeWrites = 0;
  const customerId = "20000000-0000-4000-8000-000000000001", versionId = "80000000-0000-4000-8000-000000000001";
  const linkId = "90000000-0000-4000-8000-000000000001", url = "/store#synthetic-readonly-link";
  await page.route("**/api/pricing-documents?**", route => route.fulfill({ json: { result: new URL(route.request().url()).searchParams.get("action") === "versions"
    ? [{ id: versionId, version: 1, content: { title: "합성 18품목 견적" }, publishedAt: "2026-11-08T00:00:00Z" }]
    : { items: [{ id: "document", revision: 1, content: { title: "합성 18품목 견적" } }] } } }));
  await page.route("**/api/pricing-order-settings?**", route => route.fulfill({ json: new URL(route.request().url()).searchParams.has("customerQuery")
    ? { customers: [{ id: customerId, customer_name: "합성 가칭 매장" }] } : { settings: { cutoff_time: "22:00", minimum_amount: 0 } } }));
  await page.route("**/api/pricing-store-links**", route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      if (input.action === "create") {
        expect(input.customerId).toBe(customerId); expect(input.documentVersionId).toBe(versionId); expect(input.canOrder).toBe(false);
        created = true; creates++; return route.fulfill({ json: { id: linkId, customerId, created: true, url } });
      }
      expect(input).toMatchObject({ action: "revoke", id: linkId }); revoked = true;
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ json: { items: created ? [{ id: linkId, customerId, customerName: "합성 가칭 매장", documentTitle: "합성 18품목 견적", documentVersion: 1, documentVersionId: versionId,
      url, issuedAt: "2026-11-08T00:00:00Z", expiresAt: "2099-12-31", revokedAt: revoked ? "2026-11-08T01:00:00Z" : null, canOrder: false, viewCount: 0, orderCount: 0, interest: "미열람" }] : [], hasMore: false } });
  });
  await context.route("**/api/storefront", route => {
    if (route.request().method() !== "POST") { storeWrites++; return route.abort(); }
    expect(route.request().postDataJSON().token).toBe("synthetic-readonly-link");
    if (revoked) return route.fulfill({ status: 404, json: { message: "매장 링크를 사용할 수 없습니다." } });
    return route.fulfill({ json: { store: { title: "합성 18품목 견적", companyName: "합성 유통", customerName: "합성 가칭 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, nextDeliveryDate: "2099-01-05", selectedDeliveryDate: "2099-01-05", notice: "", marketPriceNotice: "",
      policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: Array.from({ length: 18 }, (_, i) => ({ key: `product-${i}:`, productId: `product-${i}`, promotionId: null, name: `합성 품목${i+1}`, category: "", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: true, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null })) },
      orders: [], preferences: [], historyPage: 1, historyHasMore: false } });
  });
  await page.goto("/revenue/pricing/links");
  await expect(page.getByRole("checkbox", { name: "주문 없이 열람만 가능한 링크 (한 매장)", exact: true })).toHaveCount(0);
  await page.goto("/revenue/pricing/links?fixture=read-only-link-issuance");
  await page.getByLabel("문서 선택", { exact: false }).selectOption("document");
  await page.getByLabel("발행 버전", { exact: false }).selectOption(versionId);
  await page.getByLabel("거래처 검색", { exact: true }).fill("합성"); await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByLabel("링크를 받을 매장", { exact: true }).selectOption(customerId);
  await page.getByRole("checkbox", { name: "주문 없이 열람만 가능한 링크 (한 매장)", exact: true }).check();
  await expect(page.getByRole("button", { name: "회사 전체 매장 링크 발급", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "링크 만들고 복사", exact: true }).click();
  await expect(page.getByLabel("방금 만든 매장 링크", { exact: true })).toHaveValue(url);
  const storePage = await context.newPage(); await storePage.setViewportSize({ width, height: 900 });
  await storePage.goto(url); await storePage.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(storePage.getByText("합성 품목18", { exact: true })).toBeVisible();
  await expect(storePage.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
  await storePage.screenshot({ path: info.outputPath(`readonly-store-${width}.png`), fullPage: true });
  expect(await storePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.getByRole("button", { name: "회수", exact: true }).click(); await storePage.reload();
  await expect(storePage.getByText("매장 링크를 사용할 수 없습니다.", { exact: false })).toBeVisible();
  expect(creates).toBe(1); expect(storeWrites).toBe(0);
  await storePage.close();
});
