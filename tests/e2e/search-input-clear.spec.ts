import { expect, test } from "@playwright/test";

// CC-47-1: 지도 검색창에 × (값이 있을 때만) · × 뒤 포커스 유지 · 누르면 검색 결과 패널이 닫히고 검색어가 지워진다.
for (const width of [1440, 390]) test(`지도 검색창 ×와 Esc (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads: [], salesRegionsConfigured: true } }));
  await page.route(/\/api\/business-search\?/, (route) => route.fulfill({ json: { results: [] } }));
  await page.goto("/map");
  if (width < 640) await page.getByRole("button", { name: "필터", exact: true }).click();

  const search = page.getByPlaceholder("상호·주소·전화");
  await expect(page.getByRole("button", { name: "검색어 지우기" })).toHaveCount(0);
  await search.fill("가짜상호");
  const clear = page.getByRole("button", { name: "검색어 지우기" });
  await expect(clear).toBeVisible();
  await expect(page.getByRole("region", { name: "검색 결과" })).toBeVisible();
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(clear).toHaveCount(0);
  await expect(page.getByRole("region", { name: "검색 결과" })).toHaveCount(0);

  await search.fill("가짜상호");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});
