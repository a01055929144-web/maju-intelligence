import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`거래처 전표 링크가 목록과 새 전표를 미리 선택한다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    const partnerId = "10000000-0000-4000-8000-000000000002";
    const listPartnerIds: string[] = [];
    await page.route(/\/api\/business-documents(?:\?|$)/, (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("mode") === "options") return route.fulfill({ json: { customers: [{ id: partnerId, name: "합성거래처 02" }], suppliers: [], products: [], supplierProducts: [] } });
      listPartnerIds.push(url.searchParams.get("partnerId") || "");
      return route.fulfill({ json: { items: [] } });
    });

    await page.goto(`/operations/documents?partnerType=customer&partnerId=${partnerId}`);

    await expect(page).toHaveURL(/\/operations\/documents\?partnerType=customer/);
    await expect(page.getByLabel("거래처 필터")).toHaveValue(partnerId);
    await expect(page.getByLabel("매출처")).toHaveValue(partnerId);
    await expect.poll(() => listPartnerIds).toContain(partnerId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
