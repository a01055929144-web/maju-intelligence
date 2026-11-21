import { describe, expect, it } from "vitest";
import { buildSalesKitLines, composeDmWithKit, createShortCode, getPublicSalesKitContact, parseSalesKit, SHORT_CODE_PATTERN, validateOrderUrl, validatePriceSheetUrl } from "../domains/lead/sales-kit";

describe("sales kit", () => {
  it("creates 7-character short codes", () => {
    expect(createShortCode()).toMatch(SHORT_CODE_PATTERN);
  });

  it("builds footer lines with short links, default material and fallback phone", () => {
    const kit = parseSalesKit(JSON.stringify({
      defaults: { price_sheet: "aaaaaaa" },
      fields: ["price_sheet", "order_link", "contact"],
      materials: [
        { code: "aaaaaaa", kind: "price_sheet", name: "기본.pdf", uploadedAt: "2026-11-01T00:00:00Z" },
        { code: "bbbbbbb", kind: "price_sheet", name: "새.pdf", uploadedAt: "2026-11-03T00:00:00Z" }
      ],
      orderCode: "ccccccc",
      orderUrl: "https://example.com/order"
    }));
    const lines = buildSalesKitLines(kit, { companyName: "가짜유통", fallbackPhone: "01000000000", origin: "https://maju.example/" });
    expect(lines.map((line) => line.text)).toEqual([
      "▶ 단가표 https://maju.example/m/aaaaaaa",
      "▶ 주문하기 https://maju.example/m/ccccccc",
      "▶ 문의 가짜유통 010-0000-0000"
    ]);
    expect(composeDmWithKit("안녕하세요", lines, ["price_sheet"])).toBe("안녕하세요\n\n▶ 단가표 https://maju.example/m/aaaaaaa");
    expect(composeDmWithKit("안녕하세요 ", lines, [])).toBe("안녕하세요");
  });

  it("drops invalid stored values and only accepts https order links", () => {
    expect(parseSalesKit("{bad").materials).toEqual([]);
    expect(parseSalesKit(JSON.stringify({ materials: [{ code: "../x", kind: "price_sheet" }] })).materials).toEqual([]);
    expect(validateOrderUrl("http://example.com")).not.toBe("");
    expect(validateOrderUrl("https://example.com")).toBe("");
    expect(validatePriceSheetUrl("javascript:alert(1)")).not.toBe("");
    expect(validatePriceSheetUrl("https://example.com/pricing-document#fake")).toBe("");
  });

  it("keeps public contact off by default and never falls back to a representative phone", () => {
    const direct = parseSalesKit(JSON.stringify({ contactLabel: "영업팀", contactPhone: "010-1234-5678", publicContactEnabled: true }));
    expect(getPublicSalesKitContact(direct)).toEqual({ label: "영업팀", phone: "01012345678" });
    expect(getPublicSalesKitContact(parseSalesKit(JSON.stringify({ contactPhone: "010-1234-5678" })))).toBeNull();
    expect(getPublicSalesKitContact(parseSalesKit(JSON.stringify({ publicContactEnabled: true })))).toBeNull();
  });
});
