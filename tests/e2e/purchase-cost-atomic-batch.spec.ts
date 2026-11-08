import { expect, test, type Page } from "@playwright/test";
import { summarizePurchaseHistory, type PurchaseHistoryRow } from "../../domains/pricing/purchase-receipt";
import type { PurchaseDateRow } from "../../domains/pricing/purchase-cost-date";
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
async function purchaseUpload(page: Page, options: { count?: number; currentDate?: string; supported?: boolean; multipleSuppliers?: boolean; newProducts?: boolean; failFirstSave?: boolean; unresolvedMapping?: boolean; undatedCurrent?: boolean; loseFirstResponse?: boolean; failFirstSaveThenReload?: boolean; newerLatestBatch?: boolean; mixed?: boolean } = {}) {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const products = Array.from({ length: options.mixed ? 5 : options.count || 1 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `ERP-${index + 1}`, name: index ? `합성 상품 ${index + 1}` : "합성 상품", spec: options.mixed ? ["1kg", "500g", "2kg", "1kg", "750ml"][index] : "1kg", unit: options.mixed ? ["봉", "EA", "BOX", "봉", "병"][index] : "봉", cost: 100, priceDate: options.undatedCurrent ? undefined : options.currentDate || "2026-11-05" })).flatMap(product => options.multipleSuppliers ? [
      { ...product, supplierName: "A매입처", supplierProductId: "40000000-0000-4000-8000-000000000001", supplierRawCost: 100 },
      { ...product, supplierName: "B매입처", supplierProductId: "40000000-0000-4000-8000-000000000002", supplierRawCost: 100 }
    ] : [product]);
  const registration = { imports: 0, standards: 0 };
  const pricingCommands: unknown[] = [];
  let historyRows: PurchaseHistoryRow[] = [];
  let beforePrices: typeof products | null = null;
  const dateWrites: Array<{ action: string; batchId: string; rows: PurchaseDateRow[] }> = [];
  const writes: Array<{ changes: Array<{ cost: number; priceDate: string }> }> = [];
  const receipts: Array<{ lines: Array<{ rawCost: number; purchaseDate: string; rowNumber: number }> }> = [];
  await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  await page.route("**/api/price-sheets/costs*", route => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "applied", batchId: "30000000-0000-4000-8000-000000000001" } });
    }
    return route.fulfill({ json: { products: !registration.standards && options.newProducts ? [] : !registration.standards && options.mixed ? products.slice(0, 4) : products, changes: [], suppliers: [], batchEnabled: true, purchaseDateEnabled: options.supported !== false, latestBatch: null } });
  });
  let dateBatch: { id: string; status: string; recalcRunId: string | null; rowCount: number; historyOnlyProductCount: number } | null = null;
  await page.route("**/api/price-sheets/costs/date-batches*", route => {
    if (options.supported === false) return route.fulfill({ status: 404, json: {} });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); dateWrites.push(body);
      if ((options.failFirstSave || options.failFirstSaveThenReload) && dateWrites.length === 1) return route.fulfill({ status: 409, json: { message: "합성 원자 저장 실패" } });
      const groups = new Map<string, PurchaseDateRow[]>();
      for (const row of (body.rows || []) as PurchaseDateRow[]) { const group = groups.get(row.productId) || []; group.push(row); groups.set(row.productId, group); }
      const historyOnlyProductCount = Array.from(groups.values()).filter(group => {
        const latest = group.map(row => row.priceDate).sort().at(-1)!;
        const chosen = group.find(row => row.priceDate === latest && row.priceSelected);
        return !chosen || (options.currentDate && latest < options.currentDate) || (options.undatedCurrent && !chosen.replaceUndatedCurrent);
      }).length;
      if (options.mixed) {
        if (body.action === "save") {
          beforePrices = structuredClone(products);
          for (const [id, group] of Array.from(groups)) {
            const latest = group.map(row => row.priceDate).sort().at(-1)!;
            const chosen = group.find(row => row.priceDate === latest && row.priceSelected);
            const product = products.find(item => item.id === id);
            if (chosen && product) { product.cost = chosen.cost; product.priceDate = chosen.priceDate; }
          }
          historyRows = body.rows.map((row: PurchaseDateRow) => ({ id: `60000000-0000-4000-8000-${String(row.selectedSourceRowNumber).padStart(12, "0")}`,
            product_catalog_id: row.productId, receipt_date: row.priceDate, line_key: row.lineKey, product_name: row.productName, spec: row.spec, unit: row.unit,
            supplier_name: row.supplierName, quantity: row.quantity ?? null, unit_cost_ex_vat: row.cost, total_amount: row.totalAmount, correctable: true, correctionRevision: 0 }));
        } else if (body.action === "restore" && beforePrices) {
          products.forEach((product, index) => Object.assign(product, beforePrices![index])); historyRows = [];
        }
      }
      dateBatch = { id: body.batchId, status: body.action === "restore" ? "restored" : "completed", recalcRunId: null, rowCount: body.rows?.length || 0, historyOnlyProductCount };
      if (options.loseFirstResponse && dateWrites.length === 1) return route.abort("failed");
      return route.fulfill({ json: { batchId: body.batchId, status: dateBatch.status, recalcRunId: null, rowCount: dateBatch.rowCount, historyOnlyProductCount } });
    }
    if (new URL(route.request().url()).searchParams.has("batchId")) return route.fulfill({ json: { enabled: true, batch: dateBatch } });
    return route.fulfill({ json: { enabled: true, maxRows: 5000, latestBatch: options.newerLatestBatch && dateBatch ? { ...dateBatch, id: "50000000-0000-4000-8000-000000000099", rowCount: 99 } : dateBatch, undatedPrices: options.undatedCurrent ? [{ productId: products[0].id, cost: 100 }] : [] } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, route => {
    if (route.request().method() === "POST") pricingCommands.push(route.request().postDataJSON());
    return route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 50 } });
  });
  await page.route("**/api/price-sheets/receipts*", route => {
    if (route.request().method() === "POST") receipts.push(route.request().postDataJSON());
    if (options.mixed && route.request().method() === "GET") {
      const params = new URL(route.request().url()).searchParams;
      const rows = params.has("productId") ? historyRows.filter(row => row.product_catalog_id === params.get("productId")) : historyRows;
      return route.fulfill({ json: params.has("summary") ? { summary: summarizePurchaseHistory(rows) } : { rows, hasMore: false, canCorrect: true } });
    }
    return route.fulfill({ json: { summary: [], saved: receipts.at(-1)?.lines.length || 0 } });
  });
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));
  await page.route("**/api/product-catalog/imports", route => {
    if (!options.newProducts && !options.mixed) throw new Error("No new product may be created in date UI checks");
    const body = route.request().postDataJSON();
    const supplierProductId = "40000000-0000-4000-8000-000000000001";
    if (body.action === "save-import") {
      registration.imports++;
      return route.fulfill({ json: { unmatchedSupplierProductIds: [supplierProductId], productMappings: [], supplierProductMappings: [{ sourceFingerprint: body.products[0].sourceFingerprint, supplierProductId }] } });
    }
    if (body.action === "create-dated-standards") {
      registration.standards++;
      if (options.mixed) products[4].cost = 0;
      return route.fulfill({ json: { createdCount: 1, categorySuggestedCount: 0,
        productMappings: options.unresolvedMapping ? [] : [{ supplierProductId, productCatalogId: products[options.mixed ? 4 : 0].id }],
        unresolvedSupplierProductIds: options.unresolvedMapping ? [supplierProductId] : [] } });
    }
    throw new Error("Unexpected registration action");
  });
  await page.goto(`/revenue/pricing?companyId=${companyId}`);
  await expect(page.getByRole("button", { name: "① 엑셀 올리기", exact: true })).toBeVisible();
  return { writes, receipts, dateWrites, registration, pricingCommands };
}
async function selectPurchaseCsv(page: Page, text: string) {
  await expect(page.getByRole("button", { name: "① 엑셀 올리기", exact: true })).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({ name: "합성-구매일.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
}

for (const width of [1280, 390]) {
  test(`row purchase dates choose the latest day despite reversed file order at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, receipts, dateWrites } = await purchaseUpload(page);
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
    await expect.poll(() => dateWrites.length).toBe(1);
    expect(dateWrites[0].rows.map(row => [row.selectedSourceRowNumber, row.priceDate, row.unitPrice])).toEqual([[2, "2026-11-07", 300], [3, "2026-11-04", 200]]);
    expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
  });

  test(`undated conflicting prices require a choice and date confirmation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, receipts, dateWrites } = await purchaseUpload(page);
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
    await expect.poll(() => dateWrites.length).toBe(1);
    expect(dateWrites[0].rows.filter(row => row.priceSelected)).toMatchObject([{ cost: 220, priceDate: "2026-11-10" }]);
    expect(dateWrites[0].rows.map(row => row.unitPrice)).toEqual([150, 220]);
    expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
  });
}

test("held latest-day conflicts preserve all original rows without promoting an older price", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page);
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-06,200\nERP-1,합성 상품,1kg,봉,2026-11-07,400\n");
  await page.getByLabel("합성 상품 2026-11-07 적용 단가", { exact: true }).selectOption("hold");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 반영 보류 1그룹");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows.map(row => row.unitPrice)).toEqual([300, 200, 400]);
  expect(dateWrites[0].rows.filter(row => row.priceHeld)).toMatchObject([{ priceDate: "2026-11-07" }]);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
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
  const { writes, receipts } = await purchaseUpload(page, { count: 101, supported: false });
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
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { currentDate: "2026-11-08" });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 변경 0건");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows.map(row => row.priceDate)).toEqual(["2026-11-07", "2026-11-04"]);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});


for (const width of [1280, 390]) test(`all 188 conflicting groups can be held together and individually changed at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { writes, receipts } = await purchaseUpload(page, { count: 188 });
  const rows = Array.from({ length: 188 }, (_, index) => [150, 220].map(cost =>
    `ERP-${index + 1},${index ? `합성 상품 ${index + 1}` : "합성 상품"},1kg,봉,${cost}`)).flat();
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  await expect(preview.getByRole("status")).toContainText("미선택 188그룹");
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeDisabled();
  const conflicts = page.getByRole("region", { name: "상이 단가 선택", exact: true });
  const firstChoice = conflicts.getByRole("combobox", { name: /합성 상품 2026.*적용 단가/ }).first();
  await preview.getByRole("button", { name: "미선택 188개 모두 이번 가격 반영 보류", exact: true }).click();
  await expect(preview.getByRole("status")).toContainText("미선택 0그룹");
  await expect(firstChoice).toHaveValue("hold");
  await firstChoice.selectOption("2");
  await expect(firstChoice).toHaveValue("2");
  await expect(preview.getByRole("status")).toContainText("미선택 0그룹");
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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


test("different suppliers on the same product and day require an explicit source choice", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { multipleSuppliers: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,매입처,구매일,단가\nERP-1,합성 상품,1kg,봉,A매입처,2026-11-07,150\nERP-1,합성 상품,1kg,봉,B매입처,2026-11-07,220\n");
  const align = page.getByRole("button", { name: "② 열 정렬", exact: true });
  await expect(align).toBeDisabled();
  const choice = page.getByLabel("합성 상품 2026-11-07 적용 단가", { exact: true });
  await expect(choice).toHaveValue("");
  await expect(choice.getByRole("option", { name: /A매입처.*150원/ })).toHaveCount(1);
  await expect(choice.getByRole("option", { name: /B매입처.*220원/ })).toHaveCount(1);
  await choice.selectOption("2");
  await align.click();
  await expect(page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" })).toHaveValue("150");
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows.filter(row => row.priceSelected)).toMatchObject([{ cost: 150, supplierProductId: "40000000-0000-4000-8000-000000000001" }]);
  expect(dateWrites[0].rows.map(row => row.unitPrice)).toEqual([150, 220]);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});


test("390px saves all 3417 synthetic rows and 745 selections through v2 only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { count: 745 });
  const rows = Array.from({ length: 3417 }, (_, index) => {
    const item = index % 745;
    return `ERP-${item + 1},${item ? `합성 상품 ${item + 1}` : "합성 상품"},1kg,봉,300`;
  });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  const align = page.getByRole("button", { name: "② 열 정렬", exact: true });
  await expect(align).toBeEnabled();
  const started = Date.now();
  await align.click();
  const save = page.getByRole("button", { name: "③ 저장 (745건)", exact: true });
  await expect(save).toBeEnabled();
  console.info(`purchase-date-ui synthetic rows=3417 products=745 width=390 alignMs=${Date.now() - started}`);
  await save.click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("원본 거래 3417행");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows).toHaveLength(3417);
  expect(dateWrites[0].rows.filter(row => row.priceSelected)).toHaveLength(745);
  expect(new Set(dateWrites[0].rows.map(row => row.selectedSourceRowNumber)).size).toBe(3417);
  await page.reload();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "직전 날짜별 매입가·판매가 함께 되돌리기", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(2);
  expect(dateWrites[1]).toMatchObject({ action: "restore", batchId: dateWrites[0].batchId });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

for (const width of [1280, 390]) test(`new-product mapping survives failed v2 save and retries the same batch at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { writes, receipts, dateWrites, registration } = await purchaseUpload(page, { newProducts: true, failFirstSave: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: /③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 원자 저장 실패" })).toBeVisible();
  await expect(review).toContainText("날짜별 가격 적용 미완료: 2행");
  await expect(review).toContainText("새로 등록한 미가격 상품 1개");
  expect(registration).toEqual({ imports: 1, standards: 1 });
  expect(dateWrites[0].rows.every(row => row.productId === "20000000-0000-4000-8000-000000000001")).toBe(true);
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(2);
  expect(dateWrites[1]).toEqual(dateWrites[0]);
  expect(registration).toEqual({ imports: 1, standards: 1 });
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
  await expect(page.getByRole("status").filter({ hasText: "원본 거래 2행 저장과" })).toBeVisible();
});

test("unresolved catalog mapping reports source rows and never guesses an ID", async ({ page }) => {
  const { dateWrites } = await purchaseUpload(page, { newProducts: true, unresolvedMapping: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: /③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "연결 미완료 원본 행: 2" })).toBeVisible();
  expect(dateWrites).toHaveLength(0);
});

test("date rollout blocks direct v1 cost changes without leaving a stale price date", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page);
  await expect(page.getByText("날짜별 저장을 사용 중입니다.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" }).fill("200");
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "직접 원가 수정을 저장할 수 없습니다" })).toBeVisible();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0); expect(dateWrites).toHaveLength(0);
});

for (const replace of [false, true]) test(`undated existing price needs separate explicit replacement approval: ${replace}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { dateWrites } = await purchaseUpload(page, { undatedCurrent: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("기준일 미확정 기존가 1품목");
  await expect(review.getByRole("cell", { name: "100원", exact: true })).toBeVisible();
  await expect(review.getByRole("cell", { name: "2026-11-07", exact: true })).toBeVisible();
  if (replace) await review.getByRole("checkbox", { name: "기준일 없는 기존가 교체", exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (replace) await page.screenshot({ path: info.outputPath("purchase-date-undated-current-390.png"), fullPage: true });
  await review.getByRole("checkbox", { name: "적용 날짜·건수와 단가 선택·보류 내용을 확인했습니다.", exact: true }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  if (replace) {
    expect(dateWrites[0].rows[0]).toMatchObject({ replaceUndatedCurrent: true, expectedPurchasePrice: 100 });
    expect(dateWrites[0].rows[1]).not.toHaveProperty("replaceUndatedCurrent");
  } else expect(dateWrites[0].rows.every(row => row.replaceUndatedCurrent === undefined)).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: `현재가 반영 ${replace ? 1 : 0}품목 · 이력 전용 ${replace ? 0 : 1}품목(현재가 유지)` })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: replace ? "기준일 미확정 1품목의 현재가 교체를 요청했습니다" : "현재가 교체를 선택하지 않은 기준일 미확정 1품목은 이력 전용 요청입니다" })).toBeVisible();
});

for (const committed of [false, true]) test(`refresh recovers the exact persisted batch after response failure: committed=${committed}`, async ({ page }) => {
  const { dateWrites } = await purchaseUpload(page, { loseFirstResponse: committed, failFirstSaveThenReload: !committed, newerLatestBatch: committed });
  const csv = "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\n";
  const saveFile = async () => {
    await selectPurchaseCsv(page, csv);
    await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  };
  await saveFile();
  await expect.poll(() => dateWrites.length).toBe(1);
  await expect(page.getByRole("alert").filter({ hasText: "상품 등록은 별도 단계" })).toBeVisible();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("maju:purchase-date-pending:00000000-0000-4000-8000-000000000001")!));
  expect(Object.keys(pending).sort()).toEqual(["digest", "id"]);
  expect(pending.id).toBe(dateWrites[0].batchId); expect(pending.digest).toMatch(/^[0-9a-f]{64}$/);
  await page.reload();
  if (committed) {
    await expect(page.getByRole("status").filter({ hasText: "이전 요청의 원본 거래 1행 저장이 이미 완료" })).toBeVisible();
    expect(dateWrites).toHaveLength(1);
  } else {
    await saveFile();
    await expect.poll(() => dateWrites.length).toBe(2);
    expect(dateWrites[1]).toEqual(dateWrites[0]);
  }
  await expect.poll(() => page.evaluate(() => localStorage.getItem("maju:purchase-date-pending:00000000-0000-4000-8000-000000000001"))).toBeNull();
});

for (const width of [1280, 390]) test(`Stage A mixed file preserves all transactions through retry, history and reload restore at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, writes, receipts, registration, pricingCommands } = await purchaseUpload(page, { mixed: true, failFirstSave: true });
  const csv = ["ERP 코드,품목,규격,단위,구매일,단가,수량,공급가액,부가세,합계",
    "ERP-1,합성 상품,1kg,봉,2026-11-07,150,1,150,15,165",
    "ERP-2,합성 상품 2,500g,EA,2026-11-07,80,2,160,16,176",
    "ERP-3,합성 상품 3,2kg,BOX,2026-11-07,100,3,300,30,330",
    "ERP-4,합성 상품 4,1kg,봉,2026-11-07,120,4,480,48,528",
    "ERP-4,합성 상품 4,1kg,봉,2026-11-07,130,5,650,65,715",
    "ERP-5,합성 상품 5,750ml,병,2026-11-07,90,6,540,54,594"].join("\n");
  await selectPurchaseCsv(page, csv);
  await expect(page.getByRole("button", { name: "② 열 정렬", exact: true })).toBeDisabled();
  await page.getByLabel("합성 상품 4 2026-11-07 적용 단가", { exact: true }).selectOption("hold");
  await page.getByRole("button", { name: "② 열 정렬", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "매입가 보기", exact: true });
  await expect(nav.getByRole("button", { name: "인상 1", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "인하 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "③ 저장 (4건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("원본 거래 6행"); await expect(review).toContainText("가격 반영 보류 1그룹");
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 원자 저장 실패" })).toBeVisible();
  expect(registration).toEqual({ imports: 1, standards: 1 });
  await review.getByRole("checkbox").check();
  const deniedRoute = "**/api/price-sheets/costs?*";
  await page.route(deniedRoute, route => route.fulfill({ status: 403, json: { message: "Forbidden" } }));
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자에게 권한을 확인한 뒤 다시 시도" })).toBeVisible();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(dateWrites).toHaveLength(1);
  await page.unroute(deniedRoute);
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자에게 권한" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "③ 저장 (4건)", exact: true })).toBeEnabled();
  await review.getByRole("checkbox").check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "현재가 반영 4품목 · 이력 전용 1품목" })).toBeVisible();
  expect(dateWrites).toHaveLength(2); expect(dateWrites[1]).toEqual(dateWrites[0]);
  const rows = dateWrites[1].rows;
  expect(rows.map(row => [row.selectedSourceRowNumber, row.cost, row.quantity, row.supplyAmount, row.vatAmount, row.totalAmount])).toEqual([
    [2, 150, 1, 150, 15, 165], [3, 80, 2, 160, 16, 176], [4, 100, 3, 300, 30, 330],
    [5, 120, 4, 480, 48, 528], [6, 130, 5, 650, 65, 715], [7, 90, 6, 540, 54, 594]
  ]);
  expect(rows.filter(row => row.priceSelected)).toHaveLength(4); expect(rows.filter(row => row.priceHeld)).toHaveLength(1);
  expect(rows[4].priceSelected).toBe(false);
  expect(rows[4].rawValues[5]).toBe("130");
  expect(rows[5]).toMatchObject({ productId: "20000000-0000-4000-8000-000000000005", unit: "병", spec: "750ml" });
  await nav.getByRole("button", { name: "전체", exact: true }).click();
  const productRow = (name: string) => page.getByRole("textbox", { name: `${name} 품목명`, exact: true }).locator("xpath=ancestor::tr[1]");
  await expect(productRow("합성 상품").getByRole("cell", { name: "150원", exact: true })).toBeVisible();
  await expect(productRow("합성 상품 2").getByRole("cell", { name: "80원", exact: true })).toBeVisible();
  await expect(productRow("합성 상품 5").getByRole("cell", { name: "90원", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "매입 이력", exact: true }).click();
  const history = page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(history.getByRole("button", { name: "합성 상품 2", exact: true })).toBeVisible();
  await expect(history).toContainText("500g · EA"); await expect(history).toContainText("2kg · BOX");
  await page.reload();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "직전 날짜별 매입가·판매가 함께 되돌리기", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "원본 거래를 함께 복구했습니다" })).toBeVisible();
  expect(dateWrites[2]).toMatchObject({ action: "restore", batchId: dateWrites[0].batchId });
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(productRow("합성 상품").getByRole("cell", { name: "100원", exact: true })).toBeVisible();
  await expect(productRow("합성 상품 2").getByRole("cell", { name: "100원", exact: true })).toBeVisible();
  await expect(productRow("합성 상품 5").getByRole("cell", { name: "0원", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  await expect(page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]")).toContainText("조회 조건에 맞는 매입 기록이 없습니다");
  expect(registration).toEqual({ imports: 1, standards: 1 });
  expect(pricingCommands).toEqual([]); expect(writes).toEqual([]); expect(receipts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1280, 390]) test(`empty catalog, failed retry and forbidden guidance recover without writes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, writes, receipts } = await purchaseUpload(page, { supported: false });
  let status = 200;
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/price-sheets/costs?*", route => route.fulfill({ status, json: status === 200 ? { products: [], changes: [], suppliers: [], batchEnabled: true, latestBatch: null } : { message: status === 403 ? "Forbidden" : "합성 목록 조회 실패" } }));
  await page.reload();
  await expect(page.getByText("상품이 없습니다. 엑셀을 올리거나 상품관리에서 상품을 등록해 주세요.", { exact: true })).toBeVisible();
  status = 503; await page.reload();
  const alert = page.getByRole("alert").filter({ hasText: "합성 목록 조회 실패" });
  await expect(alert).toBeVisible();
  const retry = alert.getByRole("button", { name: "목록 새로고침", exact: true });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry.click(); await expect(alert).toBeVisible();
  status = 403; await retry.click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자에게 권한을 확인한 뒤 다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "③ 저장 (0건)", exact: true })).toBeDisabled();
  status = 200; await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /조회 실패|관리자에게 권한/ })).toHaveCount(0);
  await expect(page.getByText("상품이 없습니다. 엑셀을 올리거나 상품관리에서 상품을 등록해 주세요.", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]); expect(dateWrites).toEqual([]); expect(writes).toEqual([]); expect(receipts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1280, 390]) test(`receipt correction keeps its audit revision separate from current costs at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, writes, receipts, pricingCommands } = await purchaseUpload(page, { supported: false });
  const rows: PurchaseHistoryRow[] = [{ id: "60000000-0000-4000-8000-000000000001", product_catalog_id: "20000000-0000-4000-8000-000000000001",
    receipt_date: "2026-11-07", line_key: "synthetic", product_name: "합성 상품", spec: "1kg", unit: "봉", supplier_name: "합성 매입처",
    quantity: 2, unit_cost_ex_vat: 100, total_amount: 220, correctionRevision: 0, correctable: true }];
  const corrections: Array<{ id: string; cost: number; reason: string; expectedRevision: number }> = [];
  await page.route("**/api/price-sheets/receipts*", route => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON(); corrections.push(body);
      rows[0] = { ...rows[0], unit_cost_ex_vat: body.cost, corrected: true, correctionRevision: 1 };
      return route.fulfill({ json: { ok: true } });
    }
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: params.has("summary") ? { summary: summarizePurchaseHistory(rows) } : { rows, hasMore: false, canCorrect: true } });
  });
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  const history = page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]");
  await history.getByRole("button", { name: "합성 상품", exact: true }).click();
  await history.getByRole("button", { name: "2026-11-07 합성 상품 매입 기록 정정", exact: true }).click();
  await expect(page.getByText("엑셀 원본과 청구 금액은 유지합니다.", { exact: false })).toBeVisible();
  await page.getByLabel("정정 단가", { exact: true }).fill("110");
  await page.getByLabel("정정 사유", { exact: true }).fill("합성 오입력 정정");
  await page.getByRole("button", { name: "정정 저장", exact: true }).click();
  await expect.poll(() => corrections.length).toBe(1);
  expect(corrections[0]).toMatchObject({ id: rows[0].id, cost: 110, expectedRevision: 0, reason: "합성 오입력 정정" });
  expect(rows[0]).toMatchObject({ quantity: 2, total_amount: 220, correctionRevision: 1, corrected: true });
  await expect(history.getByRole("cell", { name: "110원", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("cell", { name: "100원", exact: true }).first()).toBeVisible();
  expect(dateWrites).toEqual([]); expect(writes).toEqual([]); expect(receipts).toEqual([]); expect(pricingCommands).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
