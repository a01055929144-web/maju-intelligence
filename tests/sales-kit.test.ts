import { describe, expect, it } from "vitest";
import { buildSalesKitLines, composeDmWithKit, createShortCode, parseSalesKit, SHORT_CODE_PATTERN, validateOrderUrl } from "../domains/lead/sales-kit";

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
    const lines = buildSalesKitLines(kit, { companyName: "제이에스리테일", fallbackPhone: "010-1234-5678", origin: "https://maju.example/" });
    expect(lines.map((line) => line.text)).toEqual([
      "▶ 단가표 https://maju.example/m/aaaaaaa",
      "▶ 주문하기 https://maju.example/m/ccccccc",
      "▶ 문의 제이에스리테일 010-1234-5678"
    ]);
    expect(composeDmWithKit("안녕하세요", lines, ["price_sheet"])).toBe("안녕하세요\n\n▶ 단가표 https://maju.example/m/aaaaaaa");
    expect(composeDmWithKit("안녕하세요 ", lines, [])).toBe("안녕하세요");
  });

  it("drops invalid stored values and only accepts https order links", () => {
    expect(parseSalesKit("{bad").materials).toEqual([]);
    expect(parseSalesKit(JSON.stringify({ materials: [{ code: "../x", kind: "price_sheet" }] })).materials).toEqual([]);
    expect(validateOrderUrl("http://example.com")).not.toBe("");
    expect(validateOrderUrl("https://example.com")).toBe("");
  });
});
