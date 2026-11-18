import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { FIXED_PROMOTION_PRICE_CONTRACT, lineFromCatalog, parseDisplay, parseDocument, type DocumentContent, type DocumentVersion } from "../../domains/pricing/document";

for (const width of [1440, 390]) test(`new document VAT contract keeps fixed promotions through edit, publication and export at ${width}px`, async ({ page }) => {
  test.setTimeout(120_000); page.setDefaultTimeout(15_000);
  page.on("dialog", dialog => dialog.accept());
  const legacyId = "10000000-0000-4000-8000-000000000001", id = "10000000-0000-4000-8000-000000000002";
  const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 과세", displayName: "합성 과세", brand: "", spec: "1kg", unit: "개", price: 1000, taxType: "taxable" as const };
  const exempt = { ...product, id: "20000000-0000-4000-8000-000000000002", name: "합성 면세", displayName: "합성 면세", taxType: "exempt" as const };
  const regular = lineFromCatalog(product);
  let content: DocumentContent = parseDocument({ kind: "sheet", title: "새 가격 방식 합성", companyName: "합성 회사", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    priceContract: FIXED_PROMOTION_PRICE_CONTRACT, display: { ...parseDisplay(undefined), priceIncludesTax: true },
    lines: [regular, lineFromCatalog(exempt), ...[1100, 60].map((price, index) => ({ ...regular, displayName: index ? "합성 임박" : "합성 행사", price, promotionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, startsOn: "2020-01-01", endsOn: "2099-12-31", remaining: null, badge: index ? "임박" : "행사" }))] });
  const legacyContent = structuredClone(content); delete legacyContent.priceContract;
  legacyContent.title = "기존 방식 합성"; legacyContent.display!.priceIncludesTax = false;
  legacyContent.lines.forEach(line => { delete line.priceIncludesTax; });
  const old: DocumentVersion = { id: "40000000-0000-4000-8000-000000000001", documentId: legacyId, version: 1, revision: 1, content: structuredClone(legacyContent), publishedAt: "2026-11-18T00:00:00Z", unavailablePromotions: [], promotionStock: {} };
  const immutable = JSON.stringify(old); let revision = 1, writes = 0;
  const publications: DocumentVersion[] = [];
  const draft = () => ({ id, revision, content, updatedAt: "2026-11-19T00:00:00Z", recalculation: { publishedAt: null, needsRecalculation: false, changedProductCount: 0 } });
  const legacy = { ...draft(), id: legacyId, content: legacyContent };
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product, exempt] } });
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: [legacy, draft()], total: 2 };
    if (action === "catalog") result = { items: [product, exempt], total: 2 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성 회사", contact: "", footer: "" } };
    if (action === "versions") result = url.searchParams.get("id") === legacyId ? [old] : publications;
    if (action === "save") {
      expect(body.id).toBe(id); expect(body.expected).toBe(revision);
      content = parseDocument(body.content); expect(content.priceContract).toBe(FIXED_PROMOTION_PRICE_CONTRACT);
      expect(content.lines.map(line => line.price)).toEqual([2000, 1000, 1100, 60]);
      expect(content.lines.map(line => line.priceIncludesTax)).toEqual([false, false, true, true]);
      revision++; writes++; result = draft();
    }
    if (action === "publish") {
      expect(body.expected).toBe(revision);
      const published: DocumentVersion = { ...old, id: "40000000-0000-4000-8000-000000000002", documentId: id, revision, content: structuredClone(content), publishedAt: "2026-11-19T00:00:00Z" };
      publications.push(published); result = published;
    }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "+ 단가표", exact: true }).first().click();
  await page.getByRole("dialog", { name: "새 문서 시작" }).getByRole("button", { name: /빈 단가표로 시작/ }).click();
  await expect(page.getByRole("button", { name: "부가세 포함", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "← 문서 목록", exact: true }).click();
  await page.getByRole("button", { name: "+ 단가표", exact: true }).first().click();
  await page.getByRole("dialog", { name: "새 문서 시작" }).getByRole("button", { name: /기존 방식 합성/ }).click();
  await expect(page.getByRole("button", { name: "부가세 별도", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "← 문서 목록", exact: true }).click();
  await page.getByRole("button", { name: "새 가격 방식 합성", exact: true }).click();
  for (const [index, price] of ["1,100", "1,000", "1,100", "60"].entries()) await expect(page.getByRole("textbox", { name: `품목 ${index + 1} 단가`, exact: true })).toHaveValue(price);
  for (const index of [3, 4]) await expect(page.getByRole("textbox", { name: `품목 ${index} 단가`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "부가세 별도", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "품목 1 단가", exact: true })).toHaveValue("1,000");
  await expect(page.getByRole("textbox", { name: "품목 3 단가", exact: true })).toHaveValue("1,100");
  await expect(page.getByRole("textbox", { name: "품목 4 단가", exact: true })).toHaveValue("60");
  await page.getByRole("button", { name: "부가세 포함", exact: true }).click();
  await page.getByRole("textbox", { name: "품목 1 단가", exact: true }).fill("2200");
  await page.getByRole("textbox", { name: "품목 1 단가", exact: true }).press("Enter");
  if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "표로 보기", exact: true }).click(); }
  else await page.getByRole("tab", { name: "표", exact: true }).click();
  for (const [index, price] of ["2,200", "1,000", "1,100", "60"].entries()) await expect(page.getByRole("textbox", { name: `품목 ${index + 1} 판매가`, exact: true })).toHaveValue(price);
  if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "초안 저장", exact: true }).click(); }
  else await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "초안을 저장했습니다." })).toBeVisible(); expect(writes).toBe(1);
  await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  const preview = page.getByRole("dialog", { name: "미리보기", exact: true });
  for (const mode of [".pricing-online", ".pricing-paper"]) expect(await preview.locator(mode).first().locator("[data-document-price]").allTextContents()).toEqual(["1,100원", "60원", "2,200원", "1,000원"]);
  await expect(preview).toContainText("고정가(과세 품목 부가세 포함)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
  await mkdir("test-results/readonly-pg17/document-vat-contract", { recursive: true });
  await page.screenshot({ path: `test-results/readonly-pg17/document-vat-contract/preview-${width}.png`, fullPage: true });
  const pending = page.waitForEvent("download"); await preview.getByRole("button", { name: "1쪽 PNG 저장", exact: true }).click();
  await (await pending).saveAs(`test-results/readonly-pg17/document-vat-contract/export-${width}.png`);
  if (width === 1440) await page.pdf({ path: "test-results/readonly-pg17/document-vat-contract/print.pdf", format: "A4", printBackground: true });
  await preview.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "← 문서 목록", exact: true }).click(); await page.getByRole("button", { name: "새 가격 방식 합성", exact: true }).click();
  expect(content.lines[2].price).toBe(1100); expect(content.lines[3].price).toBe(60); expect(JSON.stringify(old)).toBe(immutable);
});
