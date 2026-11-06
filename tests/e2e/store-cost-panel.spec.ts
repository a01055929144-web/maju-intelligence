import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const item = { id: "30000000-0000-4000-8000-000000000001", revision: 1, productName: "합성 매장 채소", specification: "1kg", unit: "봉", effectiveOn: "2026-11-07", costKrw: 3500 };

test("PC cost search, history, edit, conflict, retry and permission guidance", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  let row = { ...item }, status = 200, empty = false, conflict = false;
  const patches: Record<string, unknown>[] = [];
  await page.route("**/api/store/costs**", async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers()).not.toHaveProperty("authorization");
    if (request.method() === "PATCH") {
      const body = request.postDataJSON(); patches.push(body);
      expect(Object.keys(body).sort()).toEqual(["companyId", "expectedRevision", "itemId", "row", "storeAccountId"]);
      expect(body).toMatchObject({ companyId, storeAccountId, itemId: item.id, expectedRevision: 1 });
      if (conflict) return route.fulfill({ status: 409, json: { message: "Revision conflict" } });
      row = { ...row, ...body.row, revision: 2 };
      return route.fulfill({ json: { id: row.id, revision: 2, replayed: false } });
    }
    expect(url.searchParams.get("companyId")).toBe(companyId);
    expect(url.searchParams.get("storeAccountId")).toBe(storeAccountId);
    expect(url.searchParams.has("token")).toBe(false);
    if (status !== 200) return route.fulfill({ status, json: { message: "Synthetic failure" } });
    if (url.searchParams.get("history") === "true") {
      expect(url.searchParams.get("itemId")).toBe(item.id);
      return route.fulfill({ json: { rows: [{ ...item, id: "revision-1" }] } });
    }
    return route.fulfill({ json: { rows: empty ? [] : [row] } });
  });
  await page.goto("/store?fixture=store-cost-owner");
  await expect(page.getByText(item.productName, { exact: true })).toBeVisible();
  await page.getByLabel("품목명", { exact: true }).fill("합성");
  const search = page.waitForRequest(request => request.url().includes("product=%ED%95%A9%EC%84%B1"));
  await page.getByRole("button", { name: "다시 조회", exact: true }).click(); await search;
  await page.getByRole("button", { name: "이력", exact: true }).click();
  await expect(page.getByRole("region", { name: "원가 변경 이력" })).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("수정 원가 (원)", { exact: true }).fill("-1");
  await page.getByRole("button", { name: "원가 저장", exact: true }).click();
  expect(await page.getByLabel("수정 원가 (원)", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  expect(patches).toHaveLength(0);
  await page.getByLabel("수정 원가 (원)", { exact: true }).fill("3900");
  await page.getByRole("button", { name: "원가 저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "원가를 저장했습니다" })).toBeVisible();
  expect(patches).toHaveLength(1); expect(patches[0].row).toMatchObject({ costKrw: 3900 });
  await expect(page.getByRole("form", { name: "원가 수정" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("store-cost-pc.png"), fullPage: true });
  row = { ...item }; conflict = true;
  await page.getByRole("button", { name: "다시 조회", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("button", { name: "원가 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("다른 구성원이 먼저 수정");
  await expect(page.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);
  for (const code of [503, 401, 403, 404]) {
    status = code;
    await page.getByRole("button", { name: "다시 조회", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(code === 503 ? "다시 조회" : code === 401 ? "로그인" : code === 403 ? "권한" : "담당자");
    await expect(page.getByText(item.productName, { exact: true })).toHaveCount(0);
  }
  status = 200; empty = true;
  await page.getByRole("button", { name: "다시 조회", exact: true }).click();
  await expect(page.getByText("등록된 원가가 없습니다.", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath("store-cost-empty.png"), fullPage: true });
});

test("staff can read but cannot edit; 390px keeps the PC guidance contained", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/store/costs**", route => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { rows: [item] } });
  });
  await page.goto("/store?fixture=store-cost-staff");
  await expect(page.getByText(item.productName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);
  await expect(page.getByText("직원은 원가를 조회할 수 있습니다.", { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath("store-cost-staff.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("PC에서 같은 매장 주소를 열어 주세요.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 조회", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("store-cost-390.png"), fullPage: true });
});

test("default OFF ignores client role and synthetic fixture outside CI allowlist", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/store/costs**", route => { requests++; return route.abort(); });
  await page.goto(`/store?companyId=${companyId}&storeAccountId=${storeAccountId}&role=owner`);
  await expect(page.getByRole("heading", { name: "매장 자체 원가관리" })).toHaveCount(0);
  expect(requests).toBe(0);
});
