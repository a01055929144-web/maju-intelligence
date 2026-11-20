import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_DISPLAY, documentFooterTypography, documentOutput, lineFromCatalog, parseDisplay, parseDocument, printPages, type DocumentVersion } from "../domains/pricing/document";
import { documentFooterFormattingEnabled } from "../lib/pricing/document-footer-format";
const company = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllEnvs());
it("keeps editing default OFF and requires the verified company allowlist", () => {
  vi.stubEnv("PRICING_DOCUMENT_FOOTER_FORMAT_ENABLED", "false"); vi.stubEnv("PRICING_DOCUMENT_FOOTER_FORMAT_COMPANY_IDS", company);
  expect(documentFooterFormattingEnabled(company)).toBe(false);
  vi.stubEnv("PRICING_DOCUMENT_FOOTER_FORMAT_ENABLED", "true");
  expect(documentFooterFormattingEnabled(company)).toBe(true);
  expect(documentFooterFormattingEnabled("other")).toBe(false);
  expect(documentFooterFormattingEnabled("")).toBe(false);
});
it("preserves legacy typography and accepts only safe font sizes and explicit bold", () => {
  expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
  expect(documentFooterTypography(parseDisplay(undefined))).toMatchObject({ fontSize: null, bold: false, lineHeight: 16, charactersPerLine: 60 });
  for (const footerFontSize of [12, 14, 16]) expect(parseDisplay({ footerFontSize, footerBold: true })).toMatchObject({ footerFontSize, footerBold: true });
  for (const footerFontSize of ["16", 999, -1, "16px;position:fixed"]) {
    expect(parseDisplay({ footerFontSize, footerBold: "true" })).not.toHaveProperty("footerFontSize");
    expect(parseDisplay({ footerFontSize, footerBold: "true" })).not.toHaveProperty("footerBold");
  }
  expect(documentFooterTypography(parseDisplay({ footerFontSize: 16, footerBold: true }), 1.3)).toMatchObject({ fontSize: 21, bold: true, lineHeight: 32 });
});
const line = lineFromCatalog({ id: "20000000-0000-4000-8000-000000000001", name: "합성 상품", displayName: "합성 상품", brand: "", spec: "1kg", unit: "개", price: 1000, taxType: "exempt" });
const version: DocumentVersion = { id: "30000000-0000-4000-8000-000000000001", documentId: "10000000-0000-4000-8000-000000000001", version: 1, revision: 1, publishedAt: "2026-11-19T00:00:00Z", unavailablePromotions: [], content: { kind: "sheet", title: "합성 비고", companyName: "합성 회사", contact: "", recipient: "", footer: "첫째 줄\n둘째 줄", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: [line] } };
it("keeps font and linebreaks through parsing/output without changing price or publication input", () => {
  const before = JSON.stringify(version);
  const content = parseDocument({ ...version.content, display: { footerFontSize: 14, footerBold: true, privateStyle: "PRIVATE_SYNTHETIC" } });
  const output = documentOutput({ ...version, content }, "2026-11-19");
  expect(output.footer).toBe("첫째 줄\n둘째 줄");
  expect(output.display).toMatchObject({ footerFontSize: 14, footerBold: true });
  expect(output.lines[0].price).toBe(1000);
  expect(JSON.stringify(output)).not.toContain("PRIVATE_SYNTHETIC"); expect(JSON.stringify(version)).toBe(before);
});
it("reserves extra A4 space for larger multiline bold notes and preserves every row", () => {
  const content = { ...version.content, footer: Array.from({ length: 7 }, () => "합성 배송 안내와 보관 조건을 확인해 주세요").join("\n"), lines: Array.from({ length: 96 }, (_, i) => ({ ...line, productId: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })) };
  const ordinary = documentOutput({ ...version, content }, "2026-11-19"), large = documentOutput({ ...version, content: { ...content, display: { ...DEFAULT_DISPLAY, columns: 2, footerFontSize: 16, footerBold: true } } }, "2026-11-19");
  const basePages = printPages({ ...ordinary, display: { ...DEFAULT_DISPLAY, columns: 2 } }, 1, true), styledPages = printPages(large, 1, true);
  expect(styledPages.length).toBeGreaterThanOrEqual(basePages.length);
  expect(styledPages.flatMap(page => page.lines)).toEqual(large.lines);
  expect(styledPages.every(page => page.footer === content.footer)).toBe(true);
});
