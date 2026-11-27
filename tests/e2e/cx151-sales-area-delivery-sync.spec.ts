import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`CX-151 영업 지역 배송권역 경고와 예외 선택 (${width}px)`, async ({ page }, testInfo) => {
    expect((await page.request.post("/api/customer/login", {
      data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
    })).ok()).toBeTruthy();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route("**/api/leads/permits/keyword-search-regions", async (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({ json: { deliverySync: { conflictAreas: ["서울특별시 송파구"], defaultTerritoryId: "territory-1", disabledAreas: ["서울특별시 강남구"], missingAreas: [], syncedAreas: [] }, ok: true } });
      }
      return route.fulfill({ json: {
        canManage: true,
        deliverySync: { conflictAreas: ["서울특별시 송파구"], defaultTerritoryId: "territory-1", disabledAreas: [], missingAreas: ["서울특별시 강남구"], syncedAreas: [] },
        deliverySyncEnabled: true,
        expansionCandidateEnabled: false,
        expansionCandidateRegions: [],
        recommendations: [],
        regions: [
          { id: "region-1", label: "서울특별시 강남구" },
          { id: "region-2", label: "서울특별시 송파구" }
        ],
        salesAreaState: { defaultAreas: [], effectiveAreas: ["서울특별시 강남구", "서울특별시 송파구"], explicitAreas: ["서울특별시 강남구", "서울특별시 송파구"], source: "explicit", unrecognizedRegions: [] }
      } });
    });
    await page.route("**/api/leads/permits/sales-area-stats?*", (route) => route.fulfill({ json: { stats: [] } }));

    const response = await page.goto("/dashboard/settings/sales", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("영업 지역과 배송 권역이 다릅니다.")).toBeVisible();
    await expect(page.getByText(/다른 배송 권역에 이미 포함된 지역: 서울특별시 송파구/)).toBeVisible();
    await expect(page.getByText(/기본 배송 권역에 반영되지 않은 지역: 서울특별시 강남구/)).toBeVisible();
    await expect(page.getByRole("button", { name: "배송 안 함" }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`cx151-sales-area-delivery-sync-${width}.png`), fullPage: false });
  });
}
