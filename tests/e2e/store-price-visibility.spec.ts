import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`shows manual price visibility at ${viewport.width}px without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/settings/store-price-visibility?fixture=1");
    await expect(page.getByRole("heading", { name: "새 매장 외식업 확인" })).toBeVisible();
    await expect(page.getByRole("button", { name: "외식업 확인 · 가격 공개" })).toBeVisible();
    await expect(page.getByText("개업 준비 매장입니다.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
