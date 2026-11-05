import { expect, it } from "vitest";
import { documentOrderQr } from "../lib/pricing/document-order-qr";
import { documentOutput, printPages, type DocumentVersion } from "../domains/pricing/document";
it("generates a real PNG locally with the complete order fragment", async () => {
  const url = "https://store.example.test/store#synthetic-signed-token";
  const image = await documentOrderQr(url);
  expect(image).toMatch(/^data:image\/png;base64,iVBOR/);
  expect(image.length).toBeGreaterThan(1000);
  for (const invalid of ["javascript:alert(1)", "http://store.test/store#token", "https://store.test/store", "https://store.test/store?token=secret#x", "https://store.test/other#token", "https://user:pass@store.test/store#token"])
    await expect(documentOrderQr(invalid)).rejects.toThrow();
});
it("reserves print space for QR and larger text without losing or changing lines", () => {
  const version = { version: 1, publishedAt: "2026-11-06", unavailablePromotions: [], content: { kind: "sheet", title: "synthetic", companyName: "synthetic", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", layout: "table", theme: "blue", showPrice: true, showSpec: true, showBrand: true, lines: Array.from({ length: 60 }, (_, i) => ({ productId: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, displayName: "합성 긴 품목", brand: "", spec: "1kg×12입 / 냉장 보관용 긴 규격", unit: "box", price: 12000, taxType: "exempt", visible: true, badge: "", promotionId: null })) } } as unknown as DocumentVersion;
  const output = documentOutput(version, "2026-11-06");
  const pages = printPages(output, 1.3, true);
  expect(pages.length).toBeGreaterThanOrEqual(printPages(output).length);
  expect(pages.flatMap(page => page.lines)).toEqual(output.lines);
});
