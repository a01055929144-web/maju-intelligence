import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

for (const width of [1280, 390]) test(`atomic purchase cost save and restore remain available after reload at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const companyId = "00000000-0000-4000-8000-000000000001";
  const productId = "20000000-0000-4000-8000-000000000001";
  const batchId = "30000000-0000-4000-8000-000000000001";
  let cost = 100;
  let saved = false;
  let restored = false;
  let legacyPriceCommands = 0;

  await page.request.post("/api/customer/login", {
    data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  });
  await page.route("**/api/price-sheets/costs*", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { action?: string; changes?: Array<{ cost: number }> };
      if (body.action === "save-batch") {
        expect(body.changes?.[0].cost).toBe(200);
        saved = true; cost = 200;
        return route.fulfill({ json: { batchId, status: "applied", priceRunId: "run" } });
      }
      if (body.action === "restore-batch") {
        restored = true; cost = 100;
        return route.fulfill({ json: { batchId, status: "restored" } });
      }
      throw new Error("Legacy cost write should not run with atomic batch enabled");
    }
    return route.fulfill({ json: {
      batchEnabled: true, latestBatch: saved ? { id: batchId, restoredAt: restored ? "2026-11-07T00:00:00Z" : null } : null,
      products: [{ id: productId, code: "ERP-1", name: "합성 상품", spec: "1kg", unit: "봉", cost }], changes: [], suppliers: []
    } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") legacyPriceCommands++;
    return route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 50, lastBatch: null, restored: false } });
  });
  await page.route("**/api/price-sheets/receipts*", (route) => route.fulfill({ json: { summary: [] } }));
  await page.route("**/api/pricing-documents*", (route) => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));

  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" }).fill("200");
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  await expect(page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" })).toBeEnabled();

  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "직전 매입가·판매가 함께 되돌리기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "직전 매입가·판매가를 함께 복구했습니다" })).toBeVisible();
  expect(restored).toBe(true);
  expect(legacyPriceCommands).toBe(0);
});


// Date UI contracts use only synthetic catalog/receipt/batch responses, never an operating DB.
async function purchaseUpload(page: Page, options: { count?: number; currentDate?: string; supported?: boolean } = {}) {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const products = Array.from({ length: options.count || 1 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `ERP-${index + 1}`, name: index ? `합성 상품 ${index + 1}` : "합성 상품", spec: "1kg", unit: "봉", cost: 100, priceDate: options.currentDate || "2026-11-05" }));
  const writes: Array<{ changes: Array<{ cost: number; priceDate: string }> }> = [];
  const receipts: Array<{ lines: Array<{ rawCost: number; purchaseDate: string; rowNumber: number }> }> = [];
  await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  await page.route("**/api/price-sheets/costs*", route => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "applied", batchId: "30000000-0000-4000-8000-000000000001" } });
    }
    return route.fulfill({ json: { products, changes: [], suppliers: [], batchEnabled: true, purchaseDateEnabled: options.supported !== false, latestBatch: null } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, route => route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 50 } }));
  await page.route("**/api/price-sheets/receipts*", route => {
    if (route.request().method() === "POST") receipts.push(route.request().postDataJSON());
    return route.fulfill({ json: { summary: [], saved: receipts.at(-1)?.lines.length || 0 } });
  });
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));
  await page.route("**/api/product-catalog/imports", () => { throw new Error("No new product may be created in date UI checks"); });
  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await expect(page.getByRole("button", { name: "① 엑셀 올리기", exact: true })).toBeVisible();
  return { writes, receipts };
}
async function selectPurchaseCsv(page: Page, text: string) {
  await page.locator('input[type="file"]').setInputFiles({ name: "합성-구매일.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
}

for (const width of [1280, 390]) {
  test(`row purchase dates choose the latest day despite reversed file order at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, receipts } = await purchaseUpload(page);
    await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
    const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
    await expect(preview).toContainText("행별 적용일");
    await expect(preview.getByRole("cell", { name: "2026-11-04", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" })).toHaveValue("300");
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await expect(review).toContainText("2026-11-04 · 1행");
    await expect(review).toContainText("2026-11-07 · 1행");
    const save = review.getByRole("button", { name: "확인한 날짜로 저장", exact: true });
    await expect(save).toBeDisabled();
    expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
    await review.getByRole("checkbox").check();
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`purchase-date-review-${width}.png`), fullPage: true });
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].changes).toMatchObject([{ cost: 300, priceDate: "2026-11-07" }]);
    expect(receipts[0].lines.map(line => [line.rowNumber, line.purchaseDate, line.rawCost])).toEqual([[2, "2026-11-07", 300], [3, "2026-11-04", 200]]);
  });

  test(`undated conflicting prices require a choice and date confirmation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, receipts } = await purchaseUpload(page);
    await page.getByLabel("매입일", { exact: true }).fill("2026-11-09");
    await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가,수량\nERP-1,합성 상품,1kg,봉,150,2\nERP-1,합성 상품,1kg,봉,220,3\n");
    const align = page.getByRole("button", { name: "② 열 정렬", exact: true });
    await expect(align).toBeDisabled();
    await expect(page.getByRole("region", { name: "업로드 적용일과 단가 확인" })).toContainText("미선택 1그룹");
    expect(writes).toHaveLength(0);
    await page.getByLabel("합성 상품 2026-11-09 적용 단가", { exact: true }).selectOption("3");
    await align.click();
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await review.getByRole("checkbox").check();
    await page.getByLabel("매입일", { exact: true }).fill("2026-11-10");
    await expect(review.getByRole("checkbox")).not.toBeChecked();
    await expect(review).toContainText("2026-11-10 · 2행");
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].changes).toMatchObject([{ cost: 220, priceDate: "2026-11-10" }]);
    expect(receipts[0].lines.map(line => line.rawCost)).toEqual([150, 220]);
    expect(receipts[0].lines.every(line => line.purchaseDate === "2026-11-10")).toBe(true);
  });
}

test("held latest-day conflicts preserve all original rows without promoting an older price", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page);
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-06,200\nERP-1,합성 상품,1kg,봉,2026-11-07,400\n");
  await page.getByLabel("합성 상품 2026-11-07 적용 단가", { exact: true }).selectOption("hold");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 반영 보류 1그룹");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => receipts.length).toBe(1);
  expect(writes).toHaveLength(0);
  expect(receipts[0].lines.map(line => line.rawCost)).toEqual([300, 200, 400]);
});

test("invalid purchase dates and unsupported date protection block saving", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { supported: false });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-02-30,300\nERP-1,합성 상품,1kg,봉,2026-11-07,400\n");
  await expect(page.getByRole("region", { name: "업로드 적용일과 단가 확인" }).getByRole("alert")).toContainText("원본 2행");
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeDisabled();
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("준비 중");
  await review.getByRole("checkbox").check();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

test("more than 100 price changes are blocked before any receipt or product writes", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { count: 101 });
  const rows = Array.from({ length: 101 }, (_, index) => `ERP-${index + 1},${index ? `합성 상품 ${index + 1}` : "합성 상품"},1kg,봉,300`);
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (101건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review.getByRole("alert")).toContainText("최대 100건");
  await review.getByRole("checkbox").check();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});


test("undated conflict-free uploads for today keep the existing save path without date support", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { supported: false });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\nERP-1,합성 상품,1kg,봉,300\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).not.toContainText("준비 중");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].changes[0]).toMatchObject({ cost: 300 });
  expect(writes[0].changes[0]).not.toHaveProperty("priceDate");
  expect(receipts).toHaveLength(1);
});


test("purchase rows older than the current price remain history-only", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { currentDate: "2026-11-08" });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 변경 0건");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => receipts.length).toBe(1);
  expect(writes).toHaveLength(0);
  expect(receipts[0].lines.map(line => line.purchaseDate)).toEqual(["2026-11-07", "2026-11-04"]);
});


test("all 188 conflicting groups remain selectable across pages without automatic writes", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { count: 188 });
  const rows = Array.from({ length: 188 }, (_, index) => [150, 220].map(cost =>
    `ERP-${index + 1},${index ? `합성 상품 ${index + 1}` : "합성 상품"},1kg,봉,${cost}`)).flat();
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  await expect(preview.getByRole("status")).toContainText("미선택 188그룹");
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeDisabled();
  const conflicts = page.getByRole("region", { name: "상이 단가 선택", exact: true });
  const lastChoice = conflicts.getByRole("combobox", { name: /합성 상품 188.*적용 단가/ });
  for (let pageNumber = 0; pageNumber < 10 && await lastChoice.count() === 0; pageNumber++) {
    await conflicts.getByRole("button", { name: "다음", exact: true }).click();
  }
  await expect(lastChoice).toHaveValue("");
  await lastChoice.selectOption("hold");
  await expect(preview.getByRole("status")).toContainText("미선택 187그룹");
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

test("Excel date cells display an ISO row date", async ({ page }) => {
  await purchaseUpload(page);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ERP 코드", "품목", "규격", "단위", "구매일", "단가"],
    ["ERP-1", "합성 상품", "1kg", "봉", new Date("2026-11-07T00:00:00Z"), 300]
  ]), "합성 구매일");
  await page.locator('input[type="file"]').setInputFiles({ name: "합성-구매일.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) });
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  await expect(preview.getByRole("cell", { name: "2026-11-07", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeEnabled();
});
