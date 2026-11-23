import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`shows manual price visibility at ${viewport.width}px without overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/settings/store-price-visibility?fixture=1");
    await expect(page.getByRole("heading", { name: "새 매장 외식업 확인" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "회사 설정 페이지" }).getByRole("link", { name: "매장 가격 공개" })).toHaveAttribute("href", "/dashboard/settings/store-price-visibility");
    await expect(page.getByRole("button", { name: "외식업 확인 · 가격 공개" })).toBeVisible();
    await expect(page.getByText("개업 준비 매장입니다.")).toBeVisible();
    await expect(page.getByText("확인 완료 식당")).toBeVisible();
    await expect(page.getByRole("button", { name: "가격 공개 취소" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("staff keeps read-only direct access without receiving the settings entry or write action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/settings/store-price-visibility?fixture=1&role=staff");
  await expect(page.getByText("한결식당 연남점")).toBeVisible();
  await expect(page.getByRole("link", { name: "매장 가격 공개" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /가격 공개/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
