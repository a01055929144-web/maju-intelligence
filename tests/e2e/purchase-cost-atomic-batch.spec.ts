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
async function purchaseUpload(page: Page, options: { count?: number; currentDate?: string; supported?: boolean; multipleSuppliers?: boolean; linkedSupplierConflict?: boolean; newProducts?: boolean; failFirstSave?: boolean; failFirstLink?: boolean; unresolvedMapping?: boolean; undatedCurrent?: boolean; loseFirstResponse?: boolean; failFirstSaveThenReload?: boolean; newerLatestBatch?: boolean; mixed?: boolean; historyOnlyDefault?: boolean; blankUnit?: boolean } = {}) {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const products = Array.from({ length: options.mixed ? 5 : options.linkedSupplierConflict ? 2 : options.count || 1 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: options.linkedSupplierConflict ? `ERP-${index ? "B" : "A"}` : `ERP-${index + 1}`, name: options.linkedSupplierConflict ? "합성 상품" : index ? `합성 상품 ${index + 1}` : "합성 상품", spec: options.mixed ? ["1kg", "500g", "2kg", "1kg", "750ml"][index] : "1kg", unit: options.blankUnit ? "" : options.mixed ? ["봉", "EA", "BOX", "봉", "병"][index] : "봉", cost: 100, priceDate: options.undatedCurrent ? undefined : options.currentDate || "2026-11-05" })).flatMap(product => options.multipleSuppliers ? [
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
  let linkAttempts = 0;
  let linkSaved = false;
  await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  await page.route("**/api/price-sheets/costs*", route => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "applied", batchId: "30000000-0000-4000-8000-000000000001" } });
    }
    const visibleProducts = !registration.standards && options.newProducts ? [] : !registration.standards && options.mixed ? products.slice(0, 4) : products;
    const linkedProducts = options.linkedSupplierConflict ? visibleProducts.map((product, index) => ({ ...product, id: visibleProducts[0].id,
      supplierName: index ? "B매입처" : "A매입처", supplierProductId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, supplierRawCost: 100
    })) : visibleProducts.map(product => ({ ...product, supplierName: "합성 매입처", supplierProductId: "40000000-0000-4000-8000-000000000001" }));
    return route.fulfill({ json: { products: linkSaved ? linkedProducts : visibleProducts, changes: [], suppliers: [], batchEnabled: true, purchaseDateEnabled: options.supported !== false, latestBatch: null } });
  });
  let dateBatch: { id: string; status: string; recalcRunId: string | null; rowCount: number; historyOnlyProductCount: number; sourceFileName?: string; receiptDate?: string } | null = null;
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
      if (options.mixed || options.blankUnit || options.newProducts) {
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
      dateBatch = { id: body.batchId, status: body.action === "restore" ? "restored" : "completed", recalcRunId: null, rowCount: body.rows?.length || 0, historyOnlyProductCount, sourceFileName: body.fileName, receiptDate: body.receiptDate };
      if (options.loseFirstResponse && dateWrites.length === 1) return route.abort("failed");
      return route.fulfill({ json: { batchId: body.batchId, status: dateBatch.status, recalcRunId: null, rowCount: dateBatch.rowCount, historyOnlyProductCount } });
    }
    if (new URL(route.request().url()).searchParams.has("batchId")) return route.fulfill({ json: { enabled: true, batch: dateBatch } });
    return route.fulfill({ json: { enabled: true, historyOnlyDefaultEnabled: options.historyOnlyDefault === true, maxRows: 5000, latestBatch: options.newerLatestBatch && dateBatch ? { ...dateBatch, id: "50000000-0000-4000-8000-000000000099", rowCount: 99 } : dateBatch, undatedPrices: options.undatedCurrent ? [{ productId: products[0].id, cost: 100 }] : [] } });
  });
  await page.route(/\/api\/price-sheets(?:\?|$)/, route => {
    if (route.request().method() === "POST") pricingCommands.push(route.request().postDataJSON());
    return route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 50 } });
  });
  await page.route("**/api/price-sheets/receipts*", route => {
    if (route.request().method() === "POST") receipts.push(route.request().postDataJSON());
    if ((options.mixed || options.blankUnit || options.newProducts) && route.request().method() === "GET") {
      const params = new URL(route.request().url()).searchParams;
      const rows = params.has("productId") ? historyRows.filter(row => row.product_catalog_id === params.get("productId")) : historyRows;
      return route.fulfill({ json: params.has("summary") ? { summary: summarizePurchaseHistory(rows), canCorrect: true } : { rows, hasMore: false, canCorrect: true } });
    }
    return route.fulfill({ json: { summary: [], saved: receipts.at(-1)?.lines.length || 0 } });
  });
  await page.route("**/api/pricing-documents*", route => route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } }));
  await page.route("**/api/price-sheets/links", route => {
    linkAttempts++;
    if (options.failFirstLink && linkAttempts === 1) return route.fulfill({ status: 503, json: { attempted: 1, linked: 0, retryable: true, message: "합성 연결 시간 초과" } });
    linkSaved = true;
    return route.fulfill({ json: { attempted: 1, linked: 1, retryable: false } });
  });
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

async function selectErpPurchaseWorkbook(page: Page) {
  const rows: Array<Array<string | number>> = [
    ["회사명 : 합성회사 / 2026/11/18 ~ 2026/11/20"],
    ["일자-No.", "품목명(규격)", "수량", "단가", "공급가액", "부가세", "합계", "거래처명"]
  ];
  rows.push(["2026/11/20 -4", "합성 상품 [1kg]", 1, 600, 600, "", 600, "합성 매입처"]);
  rows.push(["2026/11/20 -4", "합성 상품 [1kg]", 1, 50000, 50000, "", 50000, "합성 매입처"]);
  for (let index = 2; index < 350; index++) {
    const product = index;
    const day = 18 + (index % 3);
    rows.push([`2026/11/${day} -${index}`, `합성 상품 ${product} [1kg]`, 1, 100 + index, 100 + index, "", 100 + index, "합성 매입처"]);
  }
  rows.push(["2026/11 계", "합계", "", "", "", "", "", ""]);
  rows.push(["2026/11 소계", "합계", "", "", "", "", "", ""]);
  rows.push(["총계", "합계", "", "", "", "", "", ""]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "구매현황내역");
  await page.locator('input[type="file"]').setInputFiles({
    name: "UI0Q1ZMNJ7SUVZJ.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
  });
}

for (const width of [1440, 390]) test(`supplier links reveal current-price choices without dropping purchase history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { historyOnlyDefault: true, linkedSupplierConflict: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,매입처,구매일,단가\nERP-A,합성 상품,1kg,봉,A매입처,2026-11-19,6000\nERP-B,합성 상품,1kg,봉,B매입처,2026-11-19,5800\n");
  const align = page.getByRole("button", { name: /^② 열 정렬/ });
  await expect(align).toBeEnabled();
  await align.click();

  const conflicts = page.getByRole("region", { name: "상이 단가 선택", exact: true });
  await expect(conflicts).toBeVisible();
  await expect(conflicts).toContainText("A매입처");
  await expect(conflicts).toContainText("B매입처");
  await expect(conflicts).toContainText("6,000원");
  await expect(conflicts).toContainText("5,800원");
  await expect(page.getByRole("status").filter({ hasText: "연결 후 같은 상품·적용일" })).toContainText("현재 가격을 바꿀 행을 선택하거나 보류");
  const choice = page.getByLabel("합성 상품 2026-11-19 적용 단가", { exact: true });
  expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await choice.selectOption("3");
  await align.click();

  await page.getByRole("button", { name: "③ 저장 (2건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("2026-11-19 · 2행");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows.map(row => row.unitPrice)).toEqual([6000, 5800]);
  expect(dateWrites[0].rows.filter(row => row.priceSelected)).toMatchObject([{ unitPrice: 5800, supplierName: "B매입처" }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

for (const width of [1440, 390]) test(`new-product price choice stays visible through registration and preserves every source row at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, registration } = await purchaseUpload(page, { historyOnlyDefault: true, newProducts: true, failFirstSave: width === 390 });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,매입처,구매일,단가\nNEW-1,신규 합성 상품,1kg,봉,합성 매입처,2099-11-20,150\nNEW-1,신규 합성 상품,1kg,봉,합성 매입처,2099-11-20,220\n");
  const choice = page.getByLabel("신규 합성 상품 2099-11-20 적용 단가", { exact: true });
  await choice.selectOption(width === 390 ? "hold" : "3");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();

  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  const result = review.getByRole("region", { name: "현재 매입가 선택 결과" });
  await expect(result).toContainText("원본 행은 모두 이력에 저장");
  await expect(result).toContainText(width === 390 ? "이번 현재가 반영 보류" : "현재가로 선택: 원본 3행");
  await expect(result).toContainText("원본 2행 150원 · 원본 3행 220원");
  const futureHold = review.getByRole("status").filter({ hasText: "미래 적용일 현재가 보류" });
  if (width === 1440) await expect(futureHold).toContainText("원본 이력은 저장하지만 적용일이 오기 전에는 현재 매입가를 바꾸지 않습니다");
  else await expect(futureHold).toHaveCount(0);
  if (width === 1440) await page.getByLabel("1행 과세", { exact: true }).selectOption("taxable");
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();

  if (width === 390) {
    await expect(page.getByRole("alert").filter({ hasText: "이 표시는 상품 연결 상태이며 매입 이력 저장 완료를 뜻하지 않습니다" })).toBeVisible();
    expect(registration.standards).toBe(1);
    expect(dateWrites).toHaveLength(1);
    await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
    await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  }
  await expect.poll(() => dateWrites.length).toBe(width === 390 ? 2 : 1);
  expect(registration.standards).toBe(1);
  const savedRows = dateWrites.at(-1)!.rows;
  expect(savedRows.map(row => [row.selectedSourceRowNumber, row.unitPrice])).toEqual([[2, 150], [3, 220]]);
  expect(savedRows.filter(row => row.priceSelected)).toHaveLength(0);
  expect(savedRows.filter(row => row.priceHeld).map(row => row.selectedSourceRowNumber)).toEqual([width === 390 ? 2 : 3]);
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  await expect(page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]")).toContainText("신규 합성 상품");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`ERP 353-row headers preserve dates and suppliers before current-price choice at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await purchaseUpload(page, { count: 349, historyOnlyDefault: true });
  await selectErpPurchaseWorkbook(page);
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  await expect(preview).toContainText("행별 적용일");
  await expect(preview.getByRole("cell", { name: "2026-11-18", exact: true }).first()).toBeVisible();
  await expect(preview.getByRole("cell", { name: "2026-11-20", exact: true }).first()).toBeVisible();
  const choice = page.getByLabel("합성 상품 2026-11-20 적용 단가", { exact: true });
  await expect(choice).toBeVisible();
  await choice.selectOption("3");
  const align = page.getByRole("button", { name: /^② 열 정렬/ });
  await expect(align).toBeEnabled();
  await align.click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByLabel("3행 단위", { exact: true }).fill("BOX");
  await expect(review.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/서로 다른 원문이 같은 상품·적용일로 연결됩니다/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "③ 저장 (350건)", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1280, 390]) {
  test(`row purchase dates choose the latest day despite reversed file order at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, receipts, dateWrites } = await purchaseUpload(page);
    await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
    const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
    await expect(preview).toContainText("행별 적용일");
    await expect(preview.getByRole("cell", { name: "2026-11-04", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^② 열 정렬/ }).click();
    if (width === 390) await expect(page.getByRole("textbox", { name: "합성 상품 품목명", exact: true }).locator("xpath=ancestor::li[1]")).toContainText("이번 매입가 300원");
    else await expect(page.getByRole("cell", { name: "300원", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await expect(review).toContainText("2026-11-04 · 1행");
    await expect(review).toContainText("2026-11-07 · 1행");
    const save = review.getByRole("button", { name: "확인한 날짜로 저장", exact: true });
    await expect(save).toBeDisabled();
    expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
    await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
    const align = page.getByRole("button", { name: /^② 열 정렬/ });
    await expect(align).toBeDisabled();
    await expect(page.getByRole("region", { name: "업로드 적용일과 단가 확인" })).toContainText("미선택 1그룹");
    expect(writes).toHaveLength(0);
    await page.getByLabel("합성 상품 2026-11-09 적용 단가", { exact: true }).selectOption("3");
    await align.click();
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
    await page.getByLabel("매입일", { exact: true }).fill("2026-11-10");
    await expect(review.getByRole("checkbox", { name: /확인했습니다/ })).not.toBeChecked();
    await expect(review).toContainText("2026-11-10 · 2행");
    await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 반영 보류 1그룹");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  await expect(page.getByRole("button", { name: /^② 열 정렬/ })).toBeDisabled();
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\n");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("준비 중");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

test("more than 100 price changes are blocked before any receipt or product writes", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { count: 101, supported: false });
  const rows = Array.from({ length: 101 }, (_, index) => `ERP-${index + 1},${index ? `합성 상품 ${index + 1}` : "합성 상품"},1kg,봉,300`);
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: "③ 저장 (101건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review.getByRole("alert")).toContainText("최대 100건");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});


test("undated conflict-free uploads for today keep the existing save path without date support", async ({ page }) => {
  const { writes, receipts } = await purchaseUpload(page, { supported: false });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\nERP-1,합성 상품,1kg,봉,300\n");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).not.toContainText("준비 중");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].changes[0]).toMatchObject({ cost: 300 });
  expect(writes[0].changes[0]).not.toHaveProperty("priceDate");
  expect(receipts).toHaveLength(1);
});


test("purchase rows older than the current price remain history-only", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { currentDate: "2026-11-08" });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: "③ 저장 (0건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("가격 변경 0건");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  await expect(page.getByRole("button", { name: /^② 열 정렬/ })).toBeDisabled();
  const conflicts = page.getByRole("region", { name: "상이 단가 선택", exact: true });
  const firstChoice = conflicts.getByRole("combobox", { name: /합성 상품 2026.*적용 단가/ }).first();
  await preview.getByRole("button", { name: "미선택 188개 모두 이번 가격 반영 보류", exact: true }).click();
  await expect(preview.getByRole("status")).toContainText("미선택 0그룹");
  await expect(firstChoice).toHaveValue("hold");
  await firstChoice.selectOption("2");
  await expect(firstChoice).toHaveValue("2");
  await expect(preview.getByRole("status")).toContainText("미선택 0그룹");
  await expect(page.getByRole("button", { name: /^② 열 정렬/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
});

for (const width of [1280, 390]) test(`past imports can be saved as history only without choosing 188 conflicts at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, pricingCommands, writes, receipts } = await purchaseUpload(page, { count: 188, historyOnlyDefault: true });
  await page.getByLabel("매입일", { exact: true }).fill("2026-11-01");
  const rows = Array.from({ length: 188 }, (_, index) => [150, 220].map(cost =>
    `ERP-${index + 1},${index ? `합성 상품 ${index + 1}` : "합성 상품"},1kg,봉,${cost}`)).flat();
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,단가\n" + rows.join("\n"));
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  await expect(page.getByRole("radio", { name: "현재 매입가 변경", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "이력만 저장", exact: true }).check();
  await expect(preview).toContainText("상이 단가 188품목의 모든 원문 행을 매입 이력에 보존합니다");
  const align = page.getByRole("button", { name: /^② 열 정렬/ });
  await expect(align).toBeEnabled(); await align.click();
  await page.getByRole("button", { name: "③ 저장 (376건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("매입 이력 376행 · 현재 가격 변경 0품목");
  await review.getByRole("checkbox", { name: "적용 날짜·이력 건수와 현재 가격 변경 여부를 확인했습니다.", exact: true }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows).toHaveLength(376);
  expect(dateWrites[0].rows.filter(row => row.priceSelected)).toHaveLength(0);
  expect(dateWrites[0].rows.filter(row => row.priceHeld)).toHaveLength(188);
  const result = page.getByRole("region", { name: "매입가 저장 결과" });
  await expect(result).toContainText("현재 매입가 변경 0품목 / 이력만 188품목");
  await expect(result).toHaveClass(/border-amber-300/);
  await expect(result.getByRole("button", { name: "다시 저장", exact: true })).toBeVisible();
  expect(pricingCommands).toHaveLength(0); expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await expect(page.getByRole("button", { name: /^② 열 정렬/ })).toBeEnabled();
});


test("different suppliers on the same product and day require an explicit source choice", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page, { multipleSuppliers: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,매입처,구매일,단가\nERP-1,합성 상품,1kg,봉,A매입처,2026-11-07,150\nERP-1,합성 상품,1kg,봉,B매입처,2026-11-07,220\n");
  const align = page.getByRole("button", { name: /^② 열 정렬/ });
  await expect(align).toBeDisabled();
  const choice = page.getByLabel("합성 상품 2026-11-07 적용 단가", { exact: true });
  await expect(choice).toHaveValue("");
  await expect(choice.getByRole("option", { name: /A매입처.*150원/ })).toHaveCount(1);
  await expect(choice.getByRole("option", { name: /B매입처.*220원/ })).toHaveCount(1);
  await choice.selectOption("2");
  await align.click();
  await expect(page.getByRole("cell", { name: "150원", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  const align = page.getByRole("button", { name: /^② 열 정렬/ });
  await expect(align).toBeEnabled();
  const started = Date.now();
  await align.click();
  const save = page.getByRole("button", { name: "③ 저장 (745건)", exact: true });
  await expect(save).toBeEnabled();
  console.info(`purchase-date-ui synthetic rows=3417 products=745 width=390 alignMs=${Date.now() - started}`);
  await save.click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("원본 거래 3417행");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("combobox", { name: "1행 과세" }).selectOption("taxable");
  await page.getByRole("button", { name: /③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 원자 저장 실패" })).toBeVisible();
  await expect(review).toContainText("날짜별 가격 적용 미완료: 2행");
  await expect(review).toContainText("새로 등록한 미가격 상품 1개");
  expect(registration).toEqual({ imports: 1, standards: 1 });
  expect(dateWrites[0].rows.every(row => row.productId === "20000000-0000-4000-8000-000000000001")).toBe(true);
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("combobox", { name: "1행 과세" }).selectOption("taxable");
  await page.getByRole("button", { name: /③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "연결 미완료 원본 행: 2" })).toBeVisible();
  expect(dateWrites).toHaveLength(0);
});

test("date rollout blocks direct v1 cost changes without leaving a stale price date", async ({ page }) => {
  const { writes, receipts, dateWrites } = await purchaseUpload(page);
  await expect(page.getByText("날짜별 저장을 사용 중입니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "합성 상품 변경 후 매입가 수정" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^③ 저장/ })).toBeDisabled();
  expect(writes).toHaveLength(0); expect(receipts).toHaveLength(0); expect(dateWrites).toHaveLength(0);
});

test("현재 매입가 변경은 기준일 없는 기존가를 자동 교체한다", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { dateWrites } = await purchaseUpload(page, { historyOnlyDefault: true, undatedCurrent: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\nERP-1,합성 상품,1kg,봉,2026-11-04,200\n");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("기준일 미확정 기존가 1품목");
  await expect(review.getByRole("cell", { name: "100원", exact: true })).toBeVisible();
  await expect(review.getByRole("cell", { name: "2026-11-07", exact: true }).first()).toBeVisible();
  await expect(review).toContainText("기준일 없는 상품은 이번 적용일의 현재 매입가로 자동 교체합니다");
  await expect(review.getByRole("checkbox", { name: "기준일 없는 기존가 교체", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("purchase-date-undated-current-390.png"), fullPage: true });
  await review.getByRole("checkbox", { name: "적용 날짜·이력 건수와 현재 가격 변경 여부를 확인했습니다.", exact: true }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows[0]).toMatchObject({ replaceUndatedCurrent: true, expectedPurchasePrice: 100 });
  expect(dateWrites[0].rows[1]).not.toHaveProperty("replaceUndatedCurrent");
  await expect(page.getByRole("region", { name: "매입가 저장 결과" })).toContainText("현재 매입가 변경 1품목 / 이력만 0품목");
  await expect(page.getByRole("status").filter({ hasText: "기준일 없는 상품 1품목은 이번 적용일의 현재 매입가로 자동 교체했습니다" })).toBeVisible();
});

for (const committed of [false, true]) test(`refresh recovers the exact persisted batch after response failure: committed=${committed}`, async ({ page }) => {
  const { dateWrites } = await purchaseUpload(page, { loseFirstResponse: committed, failFirstSaveThenReload: !committed, newerLatestBatch: committed });
  const csv = "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-07,300\n";
  const saveFile = async () => {
    await selectPurchaseCsv(page, csv);
    await page.getByRole("button", { name: /^② 열 정렬/ }).click();
    await page.getByRole("button", { name: "③ 저장 (1건)", exact: true }).click();
    const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
    await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
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

for (const width of [1440, 390]) test(`Stage A mixed file preserves all transactions through retry, history and reload restore at ${width}px`, async ({ page }) => {
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
  const stageBar = page.getByRole("button", { name: "① 엑셀 올리기", exact: true }).locator("xpath=ancestor::header[1]");
  await expect(stageBar).toHaveCSS("position", "sticky");
  await expect(stageBar.getByRole("button", { name: "① 엑셀 올리기", exact: true })).toBeVisible();
  await expect(stageBar.getByRole("button", { name: /^② 열 정렬/ })).toBeVisible();
  await expect(stageBar.getByRole("button", { name: /^③ 저장/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^② 열 정렬/ })).toBeDisabled();
  await page.getByLabel("합성 상품 4 2026-11-07 적용 단가", { exact: true }).selectOption("hold");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  const nav = page.getByRole("navigation", { name: "매입가 보기", exact: true });
  await expect(nav.getByRole("button", { name: "인상 1", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "인하 1", exact: true })).toBeVisible();
  // CC-72: 기존 상품과 이름이 비슷한 새 상품(합성 상품 5)은 줄마다 "새 상품 맞음"을 골라야 저장된다.
  await expect(page.getByRole("button", { name: /^③ 저장/ })).toBeDisabled();
  await nav.getByRole("button", { name: /^신규/ }).click();
  const notDuplicate = page.getByRole("button", { name: "새 상품 맞음" });
  while (await notDuplicate.count()) await notDuplicate.first().click();
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("원본 거래 6행"); await expect(review).toContainText("가격 반영 보류 1그룹");
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 원자 저장 실패" })).toBeVisible();
  expect(registration).toEqual({ imports: 1, standards: 1 });
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  const deniedRoute = "**/api/price-sheets/costs?*";
  await page.route(deniedRoute, route => route.fulfill({ status: 403, json: { message: "Forbidden" } }));
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자에게 권한을 확인한 뒤 다시 시도" })).toBeVisible();
  await expect(review.getByRole("button", { name: "확인한 날짜로 저장", exact: true })).toBeDisabled();
  expect(dateWrites).toHaveLength(1);
  await page.unroute(deniedRoute);
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자에게 권한" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^③ 저장/ })).toBeEnabled();
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect(page.getByRole("region", { name: "매입가 저장 결과" })).toContainText("현재 매입가 변경 3품목 / 이력만 2품목");
  await expect(nav.getByRole("button", { name: "매입 이력", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(dateWrites).toHaveLength(2); expect(dateWrites[1]).toEqual(dateWrites[0]);
  const rows = dateWrites[1].rows;
  expect(rows.map(row => [row.selectedSourceRowNumber, row.cost, row.quantity, row.supplyAmount, row.vatAmount, row.totalAmount])).toEqual([
    [2, 150, 1, 150, 15, 165], [3, 80, 2, 160, 16, 176], [4, 100, 3, 300, 30, 330],
    [5, 120, 4, 480, 48, 528], [6, 130, 5, 650, 65, 715], [7, 90, 6, 540, 54, 594]
  ]);
  expect(rows.filter(row => row.priceSelected)).toHaveLength(3); expect(rows.filter(row => row.priceHeld)).toHaveLength(2);
  expect(rows[2]).toMatchObject({ cost: 100, priceSelected: false, priceHeld: true });
  expect(rows[4].priceSelected).toBe(false);
  expect(rows[4].rawValues[5]).toBe("130");
  expect(rows[5]).toMatchObject({ productId: "20000000-0000-4000-8000-000000000005", unit: "병", spec: "750ml" });
  await nav.getByRole("button", { name: "전체", exact: true }).click();
  const productRow = (name: string) => page.getByRole("textbox", { name: `${name} 품목명`, exact: true }).locator(width === 390 ? "xpath=ancestor::li[1]" : "xpath=ancestor::tr[1]");
  const expectCurrentCost = async (name: string, cost: number) => {
    const row = productRow(name);
    if (width === 390) await expect(row).toContainText(`현재 매입가 ${cost}원`);
    else await expect(row.locator('[data-col="current"]')).toContainText(`${cost}원`);
  };
  await expectCurrentCost("합성 상품", 150);
  await expectCurrentCost("합성 상품 2", 80);
  await expectCurrentCost("합성 상품 5", 90);
  await nav.getByRole("button", { name: "매입 이력", exact: true }).click();
  const history = page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(history).toContainText(`직전 업로드 묶음 · ${dateWrites[1].receiptDate} · 합성-구매일.csv · 원본 6행 · 저장 완료`);
  await expect(history.getByRole("button", { name: "합성 상품 2", exact: true })).toBeVisible();
  await expect(history).toContainText("500g · EA"); await expect(history).toContainText("2kg · BOX");
  await page.reload();
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]").getByRole("button", { name: "직전 날짜별 매입가·판매가 함께 되돌리기", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "원본 거래를 함께 복구했습니다" })).toBeVisible();
  expect(dateWrites[2]).toMatchObject({ action: "restore", batchId: dateWrites[0].batchId });
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expectCurrentCost("합성 상품", 100);
  await expectCurrentCost("합성 상품 2", 100);
  await expectCurrentCost("합성 상품 5", 0);
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

for (const width of [1440, 390]) test(`receipt correction keeps its audit revision separate from current costs at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, writes, receipts, pricingCommands } = await purchaseUpload(page, { supported: false });
  const rows: PurchaseHistoryRow[] = [{ id: "60000000-0000-4000-8000-000000000001", product_catalog_id: "20000000-0000-4000-8000-000000000001",
    receipt_date: "2026-11-07", line_key: "synthetic", product_name: "합성 상품", spec: "1kg", unit: "봉", supplier_name: "합성 매입처",
    quantity: 2, unit_cost_ex_vat: 100, total_amount: 220, correctionRevision: 0, correctable: true }];
  const corrections: Array<{ action: "correct" | "delete" | "add"; id?: string; receiptDate?: string; productName?: string; cost?: number; reason: string; expectedRevision: number }> = [];
  await page.route("**/api/price-sheets/receipts*", route => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON(); corrections.push(body);
      if (body.action === "delete") rows.splice(rows.findIndex((row) => row.id === body.id), 1);
      else if (body.action === "add") rows.push({ id: "60000000-0000-4000-8000-000000000002", receipt_date: body.receiptDate, line_key: "manual", product_name: body.productName,
        spec: body.spec, unit: body.unit, supplier_name: body.supplier, quantity: body.quantity, unit_cost_ex_vat: body.cost, correctionRevision: 0, correctable: true });
      else rows[0] = { ...rows[0], unit_cost_ex_vat: body.cost, corrected: true, correctionRevision: 1 };
      return route.fulfill({ json: { ok: true } });
    }
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: params.has("summary") ? { summary: summarizePurchaseHistory(rows), canCorrect: true } : { rows, hasMore: false, canCorrect: true } });
  });
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  const history = page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]");
  await history.getByRole("button", { name: "합성 상품", exact: true }).click();
  await history.getByRole("button", { name: "2026-11-07 합성 상품 매입 기록 정정", exact: true }).click();
  await expect(page.getByText("원본과 감사 기록은 보존합니다.", { exact: false })).toBeVisible();
  await page.getByLabel("정정 단가", { exact: true }).fill("110");
  await page.getByLabel("정정 사유", { exact: true }).fill("합성 오입력 정정");
  await page.getByRole("button", { name: "정정 저장", exact: true }).click();
  await expect.poll(() => corrections.length).toBe(1);
  expect(corrections[0]).toMatchObject({ action: "correct", id: rows[0].id, cost: 110, expectedRevision: 0, reason: "합성 오입력 정정" });
  expect(rows[0]).toMatchObject({ quantity: 2, total_amount: 220, correctionRevision: 1, corrected: true });
  await expect(history.getByRole("cell", { name: "110원", exact: true }).first()).toBeVisible();
  await history.getByRole("button", { name: "매입 줄 직접 추가", exact: true }).click();
  await page.getByLabel("직접 추가 매입일", { exact: true }).fill("2026-11-08");
  await page.getByLabel("직접 추가 품목명", { exact: true }).fill("수동 상품");
  await page.getByLabel("정정 수량", { exact: true }).fill("0.3");
  await page.getByLabel("정정 단가", { exact: true }).fill("120");
  await page.getByLabel("정정 사유", { exact: true }).fill("누락 매입 직접 추가");
  await page.getByRole("button", { name: "직접 추가", exact: true }).click();
  await expect.poll(() => corrections.length).toBe(2);
  expect(corrections[1]).toMatchObject({ action: "add", productName: "수동 상품", receiptDate: "2026-11-08", cost: 120 });
  await history.getByRole("button", { name: "수동 상품", exact: true }).click();
  await history.getByRole("button", { name: "2026-11-08 수동 상품 매입 기록 삭제", exact: true }).click();
  await page.getByLabel("정정 사유", { exact: true }).fill("잘못 추가한 줄 삭제");
  await page.getByRole("button", { name: "삭제 기록 저장", exact: true }).click();
  await expect.poll(() => corrections.length).toBe(3);
  expect(corrections[2]).toMatchObject({ action: "delete", reason: "잘못 추가한 줄 삭제" });
  await page.getByRole("button", { name: "전체", exact: true }).click();
  if (width === 390) await expect(page.getByRole("textbox", { name: "합성 상품 품목명", exact: true }).locator("xpath=ancestor::li[1]")).toContainText("현재 매입가 100원");
  else await expect(page.getByRole("cell", { name: "100원", exact: true }).first()).toBeVisible();
  expect(dateWrites).toEqual([]); expect(writes).toEqual([]); expect(receipts).toEqual([]); expect(pricingCommands).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`purchase history shows upload and two prior dates for a large batch at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites, writes, receipts, pricingCommands } = await purchaseUpload(page);
  const rows: PurchaseHistoryRow[] = Array.from({ length: 456 }, (_, index) => [
    { receipt_date: "2026-11-20", unit_cost_ex_vat: 120 + index },
    { receipt_date: "2026-11-19", unit_cost_ex_vat: 110 + index },
    { receipt_date: "2026-11-18", unit_cost_ex_vat: 100 + index }
  ]).flat().map((row, index) => ({ ...row, id: `history-${index}`, product_catalog_id: `product-${Math.floor(index / 3)}`,
    line_key: `line-${Math.floor(index / 3)}`, product_name: `대용량 품목 ${Math.floor(index / 3) + 1}`, spec: "1kg", unit: "봉", supplier_name: "합성 매입처", quantity: 1 }));
  rows.push({ ...rows[0], id: "history-extra", unit_cost_ex_vat: 121 });
  await page.route("**/api/price-sheets/receipts*", route => {
    const params = new URL(route.request().url()).searchParams;
    const selected = params.has("productId") ? rows.filter((row) => row.product_catalog_id === params.get("productId")) : rows;
    return route.fulfill({ json: params.has("summary") ? { summary: summarizePurchaseHistory(selected), canCorrect: false } : { rows: selected, hasMore: false, canCorrect: false } });
  });
  await page.route("**/api/price-sheets/costs/date-batches*", route => route.fulfill({ json: { enabled: true, historyOnlyDefaultEnabled: true, maxRows: 5000,
    latestBatch: { id: "batch-large", status: "completed", recalcRunId: null, rowCount: 1369, historyOnlyProductCount: 456,
      sourceFileName: "합성-1369행.xlsx", receiptDate: "2026-11-20" }, undatedPrices: [] } }));
  await page.reload();
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  const history = page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]");
  const first = history.getByRole("button", { name: "대용량 품목 1", exact: true }).locator("xpath=ancestor::tr[1]");
  await expect(history).toContainText("원본 1,369행");
  await expect(first).toContainText("2026-11-20"); await expect(first).toContainText("120원 · 121원");
  await expect(first).toContainText("2026-11-19"); await expect(first).toContainText("110원");
  await expect(first).toContainText("2026-11-18"); await expect(first).toContainText("100원");
  expect(dateWrites).toEqual([]); expect(writes).toEqual([]); expect(receipts).toEqual([]); expect(pricingCommands).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// CC-72: 열 정렬 결과 카드 · 저장 방식 선택(라디오) · 새 상품 중복 의심은 줄마다 고른 뒤에만 저장.
for (const width of [1280, 390]) test(`열 정렬 결과 카드와 저장 방식 선택이 열 정렬 위에 보인다 at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await purchaseUpload(page, { count: 3, historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품 [1kg],,봉,2026-11-01,150\nERP-2,합성 상품 2 [1kg],,BOX,2026-11-01,250\nERP-3,합성 상품 3 [1kg],,EA,2026-11-01,350\n");
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  for (const source of ["합성 상품 [1kg]", "합성 상품 2 [1kg]", "합성 상품 3 [1kg]"]) await expect(preview.getByRole("cell", { name: source, exact: true })).toBeVisible();
  for (const unit of ["봉", "BOX", "EA"]) await expect(preview.getByRole("cell", { name: unit, exact: true }).first()).toBeVisible();
  await expect(preview.getByRole("cell", { name: "1kg", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const history = page.getByRole("radio", { name: "이력만 저장", exact: true });
  const current = page.getByRole("radio", { name: "현재 매입가 변경", exact: true });
  await expect(current).toBeChecked();
  await expect(page.getByRole("button", { name: "② 열 정렬 (현재 매입가 변경)" })).toBeVisible();
  await history.check();
  await expect(page.getByRole("button", { name: "② 열 정렬 (이력만 저장)" })).toBeVisible();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "열 정렬 완료 · 이력만 3행" })).toContainText("다음: ③ 저장");
});

test("열 정렬 결과가 0건이면 이유를 빨간 안내로 보여 준다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await purchaseUpload(page, { historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nZZ-9,전혀없는상품,9kg,통,2026-11-01,150\n");
  await page.getByRole("radio", { name: "이력만 저장", exact: true }).check();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "저장할 줄이 0건입니다" })).toContainText("매입처 열 · 품목 열을 확인하세요");
});

test("재시도 가능한 매입처 연결 실패는 파일을 유지하고 남은 연결을 다시 시도한다 at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await purchaseUpload(page, { failFirstLink: true, historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,매입처,구매일,단가\nERP-1,합성 상품 [1kg],,봉,합성 매입처,2026-11-01,150\n");
  await page.getByRole("radio", { name: "이력만 저장", exact: true }).check();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 연결 시간 초과" })).toContainText("② 열 정렬을 다시 누르면 남은 연결부터 재시도합니다");
  await expect(page.getByRole("region", { name: "업로드 적용일과 단가 확인" }).getByRole("cell", { name: "합성 상품 [1kg]", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "열 정렬 완료 · 이력만 1행" })).toContainText("매입처 연결 1개");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const mode of ["이력만 저장", "현재 매입가 변경"] as const) test(`저장 전 확인표에서 빈 단위를 채워 ${mode} payload에 보낸다 at 390px`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { dateWrites } = await purchaseUpload(page, { blankUnit: true, historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,,2026-11-07,150\n");
  await page.getByRole("radio", { name: mode, exact: true }).check();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review).toContainText("단위 미기재 1행을 이 화면에서 채워 주세요");
  await expect(review.getByRole("cell", { name: "합성 상품", exact: true }).first()).toBeVisible();
  if (mode === "현재 매입가 변경") await expect(review.getByRole("status")).toContainText("원본 2행 · 합성 상품 · 매입 미기재 → 판매 미지정");
  await review.getByLabel("2행 단위", { exact: true }).fill("BOX");
  await expect(review.getByLabel("2행 단위", { exact: true })).toHaveValue("BOX");
  if (mode === "이력만 저장") await expect(review.getByText(/단위 확인 필요/)).toHaveCount(0);
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows[0]).toMatchObject({ unit: "BOX", priceSelected: mode === "현재 매입가 변경" });
  await page.getByRole("button", { name: "매입 이력", exact: true }).click();
  await expect(page.getByRole("heading", { name: "매입 이력", exact: true }).locator("xpath=ancestor::section[1]")).toContainText("1kg · BOX");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("현재가 충돌 선택 뒤 같은 상품으로 다시 매칭되는 단위 변경은 저장한다 at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { dateWrites } = await purchaseUpload(page, { historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,봉,2026-11-01,150\nERP-1,합성 상품,1kg,봉,2026-11-01,220\n");
  await page.getByRole("radio", { name: "현재 매입가 변경", exact: true }).check();
  await page.getByLabel("합성 상품 2026-11-01 적용 단가", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByLabel("2행 단위", { exact: true }).fill("BOX");
  await expect(review.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows).toHaveLength(2);
  expect(dateWrites[0].rows.find(row => row.selectedSourceRowNumber === 2)).toMatchObject({ unit: "BOX", priceSelected: false, unitPrice: 150 });
  expect(dateWrites[0].rows.find(row => row.selectedSourceRowNumber === 3)).toMatchObject({ priceSelected: true, unitPrice: 220 });
});

for (const width of [1440, 390]) test(`단위 미확인 행은 서버 환산 확인과 다음 행동을 안내한다 at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dateWrites } = await purchaseUpload(page, { historyOnlyDefault: true });
  await selectPurchaseCsv(page, "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,BOX,2026-11-07,150\n");
  await page.getByRole("radio", { name: "현재 매입가 변경", exact: true }).check();
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  const review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review.getByRole("status")).toContainText("원본 2행 · 합성 상품 · 매입 BOX → 판매 봉");
  await expect(review.getByRole("status")).toContainText("서버에서 검증된 환산이 없으면 원본 이력만 저장하고 현재 매입가는 보류합니다");
  await expect(review.getByRole("status")).toContainText("상품관리에서 환산을 확인한 뒤 다시 반영해 주세요");
  await page.getByRole("button", { name: /^③ 저장/ }).click();
  await review.getByRole("checkbox", { name: /확인했습니다/ }).check();
  await review.getByRole("button", { name: "확인한 날짜로 저장", exact: true }).click();
  await expect.poll(() => dateWrites.length).toBe(1);
  expect(dateWrites[0].rows).toMatchObject([{ selectedSourceRowNumber: 2, unit: "BOX", priceSelected: true, priceHeld: false }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("이번 업로드 초기화 뒤 같은 파일을 다시 골라도 단위 선택이 남지 않는다 at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await purchaseUpload(page, { blankUnit: true, historyOnlyDefault: true });
  const csv = "ERP 코드,품목,규격,단위,구매일,단가\nERP-1,합성 상품,1kg,,2026-11-01,150\n";
  await selectPurchaseCsv(page, csv);
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  let review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await review.getByRole("checkbox", { name: "2행 단위 입력 선택", exact: true }).check();
  page.once("dialog", dialog => dialog.accept());
  await review.getByRole("button", { name: "이번 업로드 초기화", exact: true }).click();
  await expect(review).toHaveCount(0);
  await selectPurchaseCsv(page, csv);
  await page.getByRole("button", { name: /^② 열 정렬/ }).click();
  review = page.getByRole("region", { name: "저장 전 적용일 확인" });
  await expect(review.getByRole("checkbox", { name: "2행 단위 입력 선택", exact: true })).not.toBeChecked();
});

test("괄호 용량과 이중 대괄호 원문을 확인표에서 잃지 않는다 at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await purchaseUpload(page, { historyOnlyDefault: true });
  await selectPurchaseCsv(page, "품목,단가,구매일\n합성치킨스탁(가상 1.2KG*6EA),100,2026-11-01\n\"합성토마토소스(가상,대상)\",200,2026-11-01\n합성고추장[14KG] [[14kg]],300,2026-11-01\n");
  const preview = page.getByRole("region", { name: "업로드 적용일과 단가 확인" });
  for (const source of ["합성치킨스탁(가상 1.2KG*6EA)", "합성토마토소스(가상,대상)", "합성고추장[14KG] [[14kg]]"]) {
    await expect(preview.getByRole("cell", { name: source, exact: true })).toBeVisible();
  }
  await expect(preview.getByRole("cell", { name: "가상 1.2KG*6EA", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "14KG", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
