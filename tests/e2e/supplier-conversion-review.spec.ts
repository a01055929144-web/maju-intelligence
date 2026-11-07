import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`supplier unit conversion requires review at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const confirmed = new Set<string>();
    const requests: Array<{ supplierProductId: string; ratio: number }> = [];
    await context.route("**/api/product-catalog/imports*", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: {
          catalogCount: 2, imports: [], suppliers: [], items: [
            { id: "same-unit", supplierId: "supplier", supplierName: "샘플 매입처", rawName: "양파", rawUnit: "EA", latestCost: 1000, costConfirmed: true, matchStatus: "confirmed", matchedCatalogId: "catalog-1", matchedCatalogName: "양파", matchedCatalogUnit: "EA", conversionConfirmed: confirmed.has("same-unit") },
            { id: "box-unit", supplierId: "supplier", supplierName: "샘플 매입처", rawName: "박스 양파", rawUnit: "BOX", latestCost: 18000, costConfirmed: true, matchStatus: "confirmed", matchedCatalogId: "catalog-2", matchedCatalogName: "양파", matchedCatalogUnit: "EA", suggestedRatio: 20, conversionConfirmed: confirmed.has("box-unit") },
          ],
        } });
      }
      const body = route.request().postDataJSON() as { action: string; supplierProductId: string; ratio: number };
      requests.push(body);
      if (body.supplierProductId === "box-unit") return route.fulfill({ status: 409, json: { message: "환산값을 다시 확인해 주세요." } });
      confirmed.add(body.supplierProductId);
      return route.fulfill({ json: { confirmed: true } });
    });
    const page = await context.newPage();
    try {
      await page.goto("/customer-items-import/preview");
      await expect(page.getByRole("button", { name: "매입처 환산 확인 · 미확정 2개" })).toBeVisible();
      await expect(page.getByLabel("매입 1EA당 기본 단위 수")).toHaveValue("1");
      await expect(page.getByLabel("매입 1BOX당 기본 단위 수")).toHaveValue("");
      await expect(page.getByRole("checkbox", { name: "박스 양파 환산 확인 선택" })).toBeDisabled();
      await page.getByRole("button", { name: "검색 결과의 1:1 항목 선택 (1)" }).click();
      await expect(page.getByRole("checkbox", { name: "양파 환산 확인 선택", exact: true })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "박스 양파 환산 확인 선택" })).not.toBeChecked();
      await page.getByLabel("매입 1BOX당 기본 단위 수").fill("20");
      await page.getByRole("checkbox", { name: "박스 양파 환산 확인 선택" }).check();
      await page.getByRole("button", { name: "선택 2개 환산 확정" }).click();
      await expect(page.getByText("1개 확정 · 1개 실패")).toBeVisible();
      await expect(page.getByRole("alert")).toContainText("환산값을 다시 확인해 주세요.");
      expect(requests.map(({ supplierProductId, ratio }) => ({ supplierProductId, ratio })).sort((a, b) => a.supplierProductId.localeCompare(b.supplierProductId))).toEqual([
        { supplierProductId: "box-unit", ratio: 20 }, { supplierProductId: "same-unit", ratio: 1 },
      ]);
      await expect(page.getByRole("button", { name: "매입처 환산 확인 · 미확정 1개" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`supplier-conversion-${width}.png`), fullPage: true });
    } finally {
      await context.close();
    }
  });
}
