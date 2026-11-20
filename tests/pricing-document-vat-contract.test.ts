import { afterEach, expect, it, vi } from "vitest";
import { pricingDocuments } from "../application/pricing/documents";
import { documentOutput, FIXED_PROMOTION_PRICE_CONTRACT, lineFromCatalog, parseDisplay, parseDocument, type DocumentContent, type DocumentVersion, type PrintLine } from "../domains/pricing/document";
import { documentVatEnabled } from "../lib/pricing/document-vat-feature";

const product = "20000000-0000-4000-8000-000000000001";
const regular = lineFromCatalog({ id: product, name: "합성 일반", displayName: "합성 일반", brand: "", spec: "1kg", unit: "개", price: 1000, taxType: "taxable" });
const promotion = (n: number, price: number, badge: "행사" | "임박" = "행사"): PrintLine => ({ ...regular, promotionId: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`, startsOn: "2020-01-01", endsOn: "2099-12-31", badge, price });
const content = (): DocumentContent => ({ kind: "sheet", title: "합성 포함가", companyName: "합성 회사", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  priceContract: FIXED_PROMOTION_PRICE_CONTRACT, display: { ...parseDisplay(undefined), priceIncludesTax: true },
  lines: [regular, { ...regular, productId: "20000000-0000-4000-8000-000000000002", taxType: "exempt" }, promotion(1, 1100), promotion(2, 60, "임박")] });
const version = (data: DocumentContent): DocumentVersion => ({ id: "40000000-0000-4000-8000-000000000001", documentId: "10000000-0000-4000-8000-000000000001", version: 1, revision: 1, publishedAt: "2026-11-19T00:00:00Z", content: data, unavailablePromotions: [] });
afterEach(() => vi.unstubAllEnvs());

it("keeps VAT editing OFF unless both switch and authenticated company match", () => {
  vi.stubEnv("PRICING_DOCUMENT_VAT_ENABLED", "false"); vi.stubEnv("PRICING_DOCUMENT_VAT_COMPANY_IDS", "synthetic-a");
  expect(documentVatEnabled("synthetic-a")).toBe(false);
  vi.stubEnv("PRICING_DOCUMENT_VAT_ENABLED", "true");
  expect(documentVatEnabled("synthetic-a")).toBe(true); expect(documentVatEnabled("synthetic-b")).toBe(false); expect(documentVatEnabled("")).toBe(false);
});
it("stores explicit price basis and keeps fixed1100/60 instead of1210/66", () => {
  const data = content(), original = JSON.stringify(data), parsed = parseDocument(data);
  expect(parsed.lines.map(line => line.priceIncludesTax)).toEqual([false, false, true, true]);
  expect(documentOutput(version(data), "2026-11-19").lines.map(line => line.price)).toEqual([1100, 1000, 1100, 60]);
  expect(JSON.stringify(data)).toBe(original);
});
it("preserves fixed gross prices through display toggles and copy/reopen", () => {
  const data = content(); data.display!.priceIncludesTax = false;
  expect(documentOutput(version(parseDocument(structuredClone(data))), "2026-11-19").lines.map(line => line.price)).toEqual([1000, 1000, 1100, 60]);
  expect(parseDocument(data).lines.map(line => line.price)).toEqual([1000, 1000, 1100, 60]);
});
it("does not reinterpret old publications, even if a browser injects row flags", () => {
  const data = content(); delete data.priceContract;
  data.lines.forEach(line => { line.priceIncludesTax = true; });
  expect(parseDocument(data).lines.every(line => line.priceIncludesTax === undefined)).toBe(true);
  expect(documentOutput(version(data), "2026-11-19").lines.map(line => line.price)).toEqual([1100, 1000, 1210, 66]);
  expect(parseDisplay(undefined).priceIncludesTax).toBe(false);
});
it("keeps exempt fixed prices and derives basis from row kind, not browser booleans", () => {
  const data = content(); data.lines[2].taxType = "exempt"; data.lines[2].priceIncludesTax = false; data.lines[0].priceIncludesTax = true;
  const parsed = parseDocument(data);
  expect(parsed.lines[0].priceIncludesTax).toBe(false); expect(parsed.lines[2].priceIncludesTax).toBe(true);
  expect(documentOutput(version(parsed), "2026-11-19").lines[2].price).toBe(1100);
});
it("rejects unknown future price contracts instead of silently dropping them", () => {
  expect(() => parseDocument({ ...content(), priceContract: "unknown-price-v2" })).toThrow("가격 방식");
});
it("enforces OFF before writes and passes canonical new-mode content only when enabled", () => {
  const request = vi.fn(), documents = pricingDocuments({ request }), input = { action: "save", id: "10000000-0000-4000-8000-000000000001", expected: 0, content: content() };
  const scope = { companyId: "00000000-0000-4000-8000-000000000001", actor: "a".repeat(64), manager: true };
  expect(() => documents.execute(scope, input)).toThrow("편집이 꺼져"); expect(request).not.toHaveBeenCalled();
  documents.execute({ ...scope, documentVatEnabled: true }, input);
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ companyId: scope.companyId }), "save", expect.objectContaining({ content: expect.objectContaining({ priceContract: FIXED_PROMOTION_PRICE_CONTRACT, lines: expect.arrayContaining([expect.objectContaining({ promotionId: input.content.lines[2].promotionId, price: 1100, priceIncludesTax: true })]) }) }));
});
