import { expect, test } from "@playwright/test";

test("owner address confirmation stays usable without horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/store/address?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("query")) return route.fulfill({ json: { results: [{ address: "서울특별시 중구 합성로 1", selectionProof: "synthetic-proof" }] } });
    return route.fulfill({ json: { address: "서울특별시 중구 합성로 1 기존호", baseAddress: "서울특별시 중구 합성로 1", addressDetail: "기존호" } });
  });
  await page.goto("/store?fixture=store-address-management&companyId=00000000-0000-4000-8000-000000000001&storeAccountId=20000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("link", { name: "배송지 주소 확인·수정" })).toBeVisible();
  await page.getByRole("link", { name: "배송지 주소 확인·수정" }).click();
  await expect(page.getByRole("heading", { name: "배송지 주소" })).toBeVisible();
  await page.getByLabel("주소 검색어").fill("합성로 1"); await page.getByRole("button", { name: "주소 검색" }).click();
  await page.getByRole("button", { name: "서울특별시 중구 합성로 1" }).click();
  await expect(page.getByRole("button", { name: "주소 저장" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
