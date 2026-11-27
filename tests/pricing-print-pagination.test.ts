import { describe, expect, it } from "vitest";
import { documentOutput, lineFromCatalog, printPages, type DocumentContent, type DocumentVersion } from "../domains/pricing/document";

const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 품목", displayName: "합성 품목", brand: "", spec: "1.8L × 12입", unit: "BOX", price: 123456, taxType: "taxable" as const };
const content: DocumentContent = {
  kind: "sheet", title: "A4 2단 인쇄", companyName: "합성 유통", contact: "", recipient: "",
  footer: "합성 인쇄 검증 · 모든 규격과 단위 보존\n배송 일정과 주문 마감은 담당자에게 확인해 주세요.\n반품·교환 조건은 거래 약정과 상품별 보관 기준을 따릅니다.",
  validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  display: { columns: 2, promoLayout: "table", info: [], productWidth: 65, priceIncludesTax: true, showTaxType: false },
  lines: Array.from({ length: 96 }, (_, index) => lineFromCatalog({ ...product, id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, displayName: `합성 품목 ${String(index + 1).padStart(3, "0")}` })),
};
const version: DocumentVersion = { id: "30000000-0000-4000-8000-000000000001", documentId: "10000000-0000-4000-8000-000000000001", version: 1, revision: 1, publishedAt: "2026-11-10T00:00:00Z", content, unavailablePromotions: [], promotionStock: {} };

describe("A4 2단 인쇄 페이지 나누기", () => {
  it.each([1, 1.15, 1.3])("%s 배율에서도 페이지당 20품목을 유지한다", (scale) => {
    const output = documentOutput(version, "2026-11-10");
    const pages = printPages(output, scale);
    expect(pages).toHaveLength(5);
    expect(pages.map((page) => page.lines.length)).toEqual([20, 20, 20, 20, 16]);
    expect(pages.flatMap((page) => page.lines)).toEqual(output.lines);
    expect(printPages({ ...output, display: { ...output.display, showTaxType: true } }, scale).map((page) => page.lines.length)).toEqual([20, 20, 20, 20, 16]);
  });

  it("전단지 형식도 행사 가격을 바꾸지 않고 모든 품목을 페이지에 한 번씩 담는다", () => {
    const promotionLines = content.lines.slice(0, 8).map((line, index) => ({
      ...line,
      promotionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      badge: "행사" as const,
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      remaining: 100,
    }));
    const flyerVersion = { ...version, content: { ...content, layout: "flyer" as const, lines: [...promotionLines, ...content.lines.slice(8)] } };
    const output = documentOutput(flyerVersion, "2026-11-10");
    const tableOutput = documentOutput({ ...flyerVersion, content: { ...flyerVersion.content, layout: "table" } }, "2026-11-10");
    const pages = printPages(output);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(page => page.lines)).toEqual(output.lines);
    expect(output.lines.map(line => line.price)).toEqual(tableOutput.lines.map(line => line.price));
  });
});
