import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { expect, test } from "@playwright/test";
import { documentDisplayPrice, lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";
import { publicDocumentOutput } from "../../domains/pricing/document-share";

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) test(`lead ${kind} entry completes drafting and publication without sending at ${width}px`, async ({ page }, info) => {
  page.setDefaultTimeout(15_000);
  const leadId = "20000000-0000-4000-8000-000000000001";
  const product = { id: "30000000-0000-4000-8000-000000000001", name: "합성 진입 품목", displayName: "합성 진입 품목", productCode: "ENTRY-1", brand: "", spec: "18L", unit: "통", price: 1000, taxType: "exempt" };
  let content: DocumentContent | undefined, documentId = "", revision = 0, published = false, profileRead = false;
  const writes: string[] = [];
  const draft = () => ({ id: documentId, revision, content, updatedAt: "2026-11-06T00:00:00Z" });
  const version = () => ({ id: "40000000-0000-4000-8000-000000000001", documentId, version: 1, revision, content, publishedAt: "2026-11-06T00:00:00Z", unavailablePromotions: [], promotionStock: {} });
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-store-links*", route => { writes.push("FORBIDDEN-store-link"); return route.fulfill({ status: 500, json: {} }); });
  await page.route(/\/api\/pricing-documents(?:\/catalog-index)?(?:\?.*)?$/, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const body = request.method() === "POST" ? request.postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: content ? [draft()] : [], total: content ? 1 : 0 };
    if (action === "profile") { profileRead = true; result = { revision: 0, content: { companyName: "합성 유통", contact: "", footer: "" } }; }
    if (action === "catalog") result = { items: [product], total: 1 };
    if (action === "versions") result = published ? [version()] : [];
    if (request.method() === "POST") {
      writes.push(action);
      expect(["save", "publish"]).toContain(action);
      if (action === "save") { content = body.content; documentId = body.id; revision++; result = draft(); }
      if (action === "publish") { published = true; result = version(); }
    }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto(`/revenue/pricing/documents?start=${kind}&leadId=${leadId}`);
  const gallery = page.getByRole("dialog", { name: "새 문서 시작", exact: true });
  await expect(gallery.getByRole("heading", { name: kind === "sheet" ? "새 단가표 만들기" : "새 견적서 만들기", exact: true })).toBeVisible();
  await expect.poll(() => profileRead).toBe(true);
  await gallery.getByRole("button", { name: new RegExp(`빈 ${kind === "sheet" ? "단가표" : "견적서"}로 시작`) }).click();
  const context = page.getByRole("complementary", { name: "리드 문서 작성 문맥", exact: true });
  await expect(context).toContainText("테스트 매장 01");
  await page.getByRole("button", { name: /합성 진입 품목.*담기/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초안을 저장했습니다");
  expect(content?.kind).toBe(kind); expect(content?.recipient).toBe("테스트 매장 01"); expect(content?.lines).toHaveLength(1);
  await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("작성·게시만 완료됐으며 리드에게 전달하지 않았습니다");
  expect(writes).toEqual(["save", "publish"]);
  const back = page.getByRole("link", { name: "리드 상세로 돌아가기", exact: true });
  await expect(back).toHaveAttribute("href", `/leads/${leadId}`);
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`lead-${kind}-entry-${width}.png`), fullPage: true });
  await back.click(); await expect(page).toHaveURL(new RegExp(`/leads/${leadId}$`));
});

for (const width of [1440, 390]) test(`public order link shows published spec at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/storefront", route => route.fulfill({ json: {
    store: { title: "합성 공개 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product", productId: "product", promotionId: null, name: "합성 미림", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
    orders: [], preferences: [], historyPage: 1, historyHasMore: false,
  } }));
  await page.goto("/store#synthetic-spec-link");
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(page.getByText("18L · 통", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
  const layout = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector("main ul")!).gridTemplateColumns.split(" ").length,
    navigation: getComputedStyle(document.querySelector("nav[aria-label='매장 메뉴']")!).position,
  }));
  expect(layout.columns).toBe(width === 390 ? 1 : 3);
  expect(layout.navigation).toBe(width === 390 ? "fixed" : "static");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) {
  test(`${kind} specs preserve published snapshots at ${width}px`, async ({ page }, info) => {
    const id = "10000000-0000-4000-8000-000000000001";
    const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 미림", displayName: "합성 미림", brand: "", spec: "18L", unit: "통", price: 1000, taxType: "exempt" as const };
    const products = Array.from({ length: 16 }, (_, i) => ({ ...product, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
    let revision = 1;
    let content: DocumentContent = { kind, title: "규격 회귀 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
      display: { columns: 2, promoLayout: kind === "sheet" ? "table" : "cards", info: [], productWidth: 65, priceIncludesTax: true },
      lines: products.map((item, i) => ({ ...lineFromCatalog({ ...item, spec: " " }), displayName: `합성 품목 ${i + 1}`, taxType: i % 2 ? "taxable" as const : "exempt" as const,
        ...(i >= 14 ? { promotionId: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, badge: "행사" as const, startsOn: "2020-01-01", endsOn: "2099-12-31" } : {}) })) };
    const oldContent = structuredClone(content);
    content = { ...content, lines: content.lines.map((line, i) => ({ ...line, displayName: `수정 초안 ${i + 1}`, unit: "BOX", price: 2200, taxType: "taxable" })) };
    let failVersions = false, failAutoRefresh = false, armedPromotionReads = 0;
    await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printCount = String(Number(document.documentElement.dataset.printCount || 0) + 1); }; });
    const draft = () => ({ id, revision, content: { ...content, lines: content.lines.map(line => ({ ...line, spec: revision === 1 ? null : line.spec })) }, updatedAt: "2026-11-05T01:00:00Z", recalculation: { publishedAt: "2026-11-05T01:00:00Z", needsRecalculation: false, changedProductCount: 0 } });
    const version = (number: number) => ({ id: `30000000-0000-4000-8000-00000000000${number}`, documentId: id, version: number, revision, publishedAt: "2026-11-05T01:00:00Z", content: number === 1 ? { ...oldContent, lines: oldContent.lines.map(line => ({ ...line, spec: null })) } : structuredClone(content), unavailablePromotions: [], promotionStock: {} });
    let published = false;
    const login = await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
    expect(login.ok()).toBeTruthy();
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/pricing-documents*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: products.map(item => ({ ...item, code: "SYNTHETIC" })) } });
      const body = request.method() === "POST" ? request.postDataJSON() : {};
      const action = body.action || url.searchParams.get("action") || "list";
      let result: unknown = [];
      if (action === "list") result = { items: [draft()], total: 1 };
      if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
      if (action === "catalog") result = { items: products, total: 16 };
      if (action === "versions" && failVersions) return route.fulfill({ status: 503, json: { message: "합성 게시 버전 확인 실패" } });
      if (action === "promotions" && failAutoRefresh && ++armedPromotionReads > 1) return route.fulfill({ status: 503, json: { message: "합성 인쇄 상태 확인 실패" } });
      if (action === "versions") result = published ? [version(2), version(1)] : [version(1)];
      if (action === "save") { content = body.content; revision++; result = draft(); }
      if (action === "publish") { published = true; result = version(2); }
      await route.fulfill({ json: { result, manager: true } });
    });
    await page.goto("/revenue/pricing/documents");
    await page.getByRole("button", { name: "규격 회귀 문서", exact: true }).click();
    await expect(page.getByText(/기존 발행본의 규격은 그대로 유지됩니다/)).toBeVisible();
    const fill = page.getByRole("button", { name: "빈 규격 원장에서 채우기", exact: true });
    if (width === 390) expect((await fill.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fill.click();
    await expect(page.getByRole("status").filter({ hasText: "원장 규격 16개" })).toBeVisible();
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "초안을 저장했습니다" })).toBeVisible();
    expect(content.lines.map(line => line.spec)).toEqual(Array(16).fill("18L"));
    expect(oldContent.lines.every(line => line.spec === " ")).toBe(true);
    await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /버전 2.*확정했습니다/ })).toBeVisible();
    await page.getByRole("button", { name: /버전 2 미리보기/ }).click();
    const dialog = page.getByRole("dialog", { name: "미리보기", exact: true });
    await expect(dialog.locator(".pricing-paper").first()).toBeVisible();
    expect(await dialog.locator(".pricing-paper").allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining("18L")]));
    await expect(dialog.getByRole("heading", { name: "온라인 · 휴대폰" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: info.outputPath(`${kind}-spec-${width}.png`), fullPage: true });
    if (width === 1440) await page.pdf({ path: info.outputPath(`${kind}-spec-a4.pdf`), format: "A4", printBackground: true });
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
    expect((await page.getByRole("dialog", { name: "미리보기", exact: true }).locator(".pricing-paper").allTextContents()).join("")).not.toContain("18L");
    const oldPreview = page.getByRole("dialog", { name: "미리보기", exact: true });
    const oldPaper = oldPreview.locator(".pricing-online");
    await expect(oldPaper.locator("[data-document-tax]")).toHaveCount(16);
    await expect(oldPaper.locator("[data-document-tax]").filter({ hasText: "면세" })).toHaveCount(8);
    await expect(oldPaper.locator("[data-document-tax]").filter({ hasText: "과세" })).toHaveCount(8);
    const downloadEvent = page.waitForEvent("download");
    await oldPreview.getByRole("button", { name: "엑셀 내려받기", exact: true }).click();
    const download = await downloadEvent;
    const workbook = XLSX.read(readFileSync((await download.path())!), { type: "buffer" });
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    expect(exported).toHaveLength(16);
    expect(exported[0]).toMatchObject({ 품목명: "합성 품목 1", 규격: "", 단위: "통", 판매가: 1000, 과세: "면세" });
    expect(exported[1]).toMatchObject({ 품목명: "합성 품목 2", 규격: "", 단위: "통", 판매가: 1100, 과세: "과세" });
    expect(JSON.stringify(exported)).not.toMatch(/수정 초안|18L|2200|원가|마진/);
    const print = oldPreview.getByRole("button", { name: "PDF·인쇄", exact: true });
    expect((await print.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    failVersions = true; await print.click();
    await expect(oldPreview.getByRole("alert")).toContainText("합성 게시 버전 확인 실패");
    expect(await page.evaluate(() => Number(document.documentElement.dataset.printCount || 0))).toBe(0);
    failVersions = false; await print.click();
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.printCount || 0))).toBe(1);
    await oldPreview.getByRole("button", { name: "닫기", exact: true }).click();
    failAutoRefresh = true;
    await page.getByRole("button", { name: "A4 인쇄", exact: true }).click();
    const automatic = page.getByRole("dialog", { name: "미리보기", exact: true });
    await expect(automatic.getByRole("alert")).toContainText("합성 인쇄 상태 확인 실패");
    expect(await page.evaluate(() => Number(document.documentElement.dataset.printCount || 0))).toBe(1);
    failAutoRefresh = false;
    await automatic.getByRole("button", { name: "PDF·인쇄", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.printCount || 0))).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    // Reuse the selected old version for both read-only browser surfaces.
    // Responses are synthetic; no link issuance, acceptance, delivery record or order is performed.
    const selected = version(1);
    let forbiddenWrites = 0;
    await page.route("**/api/pricing-document-acceptance", route => { forbiddenWrites++; return route.abort(); });
    await page.route("**/api/pricing-store-links*", route => { forbiddenWrites++; return route.abort(); });
    await page.route("**/api/pricing-documents/public", route => {
      expect(route.request().postDataJSON()).toEqual({ token: "synthetic-snapshot-document" });
      return route.fulfill({ json: { document: publicDocumentOutput(selected), expiresAt: "2099-01-01T00:00:00Z", acceptanceAvailable: false } });
    });
    await page.goto("/pricing-document#synthetic-snapshot-document");
    const shared = page.locator(".pricing-output-content");
    await expect(shared.locator("[data-document-tax]")).toHaveCount(16);
    await expect(shared).toContainText("버전 1");
    await expect(shared).toContainText("1,100원");
    await expect(shared).not.toContainText("수정 초안");
    await expect(shared).not.toContainText("18L");
    await expect(shared).not.toContainText("BOX");
    await page.screenshot({ path: info.outputPath(`${kind}-snapshot-share-${width}.png`), fullPage: true });
    await page.route("**/api/storefront", route => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON().token).toBe("synthetic-snapshot-store");
      return route.fulfill({ json: { store: { title: selected.content.title, companyName: selected.content.companyName, customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: selected.content.validUntil, priceAvailable: true, canOrder: false, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "",
        policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
        lines: selected.content.lines.map(line => ({ key: `${line.productId}:${line.promotionId ?? ""}`, productId: line.productId, promotionId: line.promotionId, name: line.displayName, category: "", brand: line.brand, spec: line.spec || "", unit: line.unit, badge: line.badge, taxType: line.taxType, unitPrice: documentDisplayPrice(line.price, line.taxType, true), priceIncludesTax: true, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null })) },
        orders: [], preferences: [], historyPage: 1, historyHasMore: false } });
    });
    await page.goto("/store#synthetic-snapshot-store");
    await page.getByRole("button", { name: "주문하기", exact: true }).click();
    const exempt = page.locator("main ul > li").filter({ has: page.getByText("합성 품목 1", { exact: true }) });
    const taxable = page.locator("main ul > li").filter({ has: page.getByText("합성 품목 2", { exact: true }) });
    await expect(exempt).toContainText("통"); await expect(exempt).toContainText("1,000원"); await expect(exempt.getByText("면세", { exact: true })).toBeVisible();
    await expect(taxable).toContainText("1,100원"); await expect(taxable.getByText("과세 · 부가세 포함", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
    await expect(page.locator("main")).not.toContainText("수정 초안");
    await expect(page.locator("main")).not.toContainText("18L");
    await expect(page.locator("main")).not.toContainText("BOX");
    expect(forbiddenWrites).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: info.outputPath(`${kind}-snapshot-store-${width}.png`), fullPage: true });
  });
}
