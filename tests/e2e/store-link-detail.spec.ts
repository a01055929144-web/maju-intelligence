import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`CX-107 store link detail stays readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect((await page.request.post("/api/customer/login", {
      data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
    })).ok()).toBeTruthy();

    await page.route("**/api/pricing-documents?**", route => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ result: { items: [] } })
    }));
    await page.route("**/api/pricing-store-links?**", route => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("linkId")) return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ledgerExposure: "orders-only",
          items: [{ name: "긴 상품 이름도 모바일에서 잘립니다 없이 표시", spec: "1kg × 10봉", source: "promotion" }],
          events: [{ id: "event-1", event_type: "view", occurred_at: "2026-11-22T09:00:00.000Z", device_class: "mobile", actor_name: null }]
        })
      });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          catalogEnabled: false,
          hasMore: false,
          items: [{
            id: "link-1", kind: "document", customerName: "제이에스리테일 1호점",
            documentTitle: "11월 행사 단가표", documentVersion: 3, documentValidUntil: "2026-12-31", url: "https://store.example.test/link-1",
            issuedAt: "2026-11-22T08:00:00.000Z", expiresAt: "2026-12-22T08:00:00.000Z", revokedAt: null,
            canOrder: true, viewCount: 2, lastViewedAt: "2026-11-22T09:00:00.000Z",
            orderCount: 1, interest: "관심", stage: "열람"
          }]
        })
      });
    });

    await page.goto("/revenue/pricing/links");
    await expect(page.getByLabel("문서별")).toBeVisible();
    await page.getByLabel("열람 0").check();
    await expect(page.getByRole("button", { name: "제이에스리테일 1호점" })).toHaveCount(0);
    await page.getByLabel("열람 0").uncheck();
    await page.getByRole("button", { name: "제이에스리테일 1호점" }).click();
    const detail = page.getByRole("region", { name: "매장 링크 상세" });
    await expect(detail.getByText("보이는 품목 · 가격 출처")).toBeVisible();
    await expect(detail.getByText("행사", { exact: true })).toBeVisible();
    await expect(detail.getByText("주문 기록만 표시", { exact: true })).toBeVisible();
    await expect(detail.getByText("view", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  });
}
