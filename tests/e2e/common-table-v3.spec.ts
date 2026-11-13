import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// CC-38a: 1열 선택·2열 번호, 열 경계 끌기(좌우 스크롤 없음, 새로고침 뒤에도 유지), 선택 N줄만 엑셀로.
const storeId = "30000000-0000-4000-8000-000000000001";
const rows = Array.from({ length: 12 }, (_, i) => ({ productId: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: `합성 상품 ${i + 1}`, category: "합성", basePrice: 1000 + i, storePrice: null, since: null, until: null, planned: null, source: "기본" }));

test("common table: select + number columns, boundary drag keeps layout, selected rows export", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/store-prices*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.searchParams.get("customerId") ? { rows } : { stores: [{ id: storeId, name: "합성 매장", grade: null, gradeId: null, priceCount: 0 }], grades: [] } });
  });
  await page.goto("/revenue/pricing/store-prices");
  await page.getByRole("combobox", { name: "매장 선택" }).selectOption(storeId);
  const table = page.locator("table").first();
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await expect(table.locator("thead th").nth(1)).toHaveText("번호");
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText("1");

  // 열 경계 끌기: 쪽 전체 좌우 스크롤이 생기지 않고, 새로고침해도 같은 너비로 남는다.
  const handle = page.getByRole("separator", { name: /열 너비 조절/ }).first();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const before = await table.locator("thead th").nth(2).evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(box!.x + 4, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 124, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await table.locator("thead th").nth(2).evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before + 40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.reload();
  await page.getByRole("combobox", { name: "매장 선택" }).selectOption(storeId);
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const reloaded = await table.locator("thead th").nth(2).evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(reloaded - after)).toBeLessThan(8);

  // 3줄 선택 → 일괄 도구 띠 → 엑셀에는 3줄 + 번호 열.
  for (const n of [1, 2, 3]) await table.locator("tbody tr").nth(n - 1).getByRole("checkbox", { name: "줄 선택" }).check();
  await expect(page.getByRole("group", { name: "일괄 도구" })).toContainText("선택 3개");
  const download = page.waitForEvent("download");
  await page.getByRole("group", { name: "일괄 도구" }).getByRole("button", { name: /엑셀 내려받기/ }).click();
  const file = await (await download).path();
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  expect(lines).toHaveLength(4);
  expect(lines[0].startsWith('"번호"')).toBe(true);
});
