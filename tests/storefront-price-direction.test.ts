import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentContent, PrintLine } from "../domains/pricing/document";
import { publishedPriceDirections, publishedPriceKey, publicSalesPriceDirection, salesPriceDirection } from "../domains/pricing/storefront-price-direction";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
import { readPublishedPriceDirections } from "../lib/pricing/storefront-price-direction";
const line: PrintLine = { productId: "p", displayName: "synthetic", brand: "", spec: "1kg", unit: "bag", price: 1000, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" };
const document = (price: number): DocumentContent => ({ kind: "sheet", title: "synthetic", companyName: "synthetic", contact: "", recipient: "store", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: [{ ...line, price }] });
beforeEach(() => { db.mockReset(); vi.stubEnv("STOREFRONT_PRICE_DIRECTION_ENABLED", "true"); });
afterEach(() => vi.unstubAllEnvs());
it("compares final selling prices including zero and flat; rejects invalid prices", () => {
  expect([salesPriceDirection(1001, 1000), salesPriceDirection(999, 1000), salesPriceDirection(0, 0)]).toEqual(["up", "down", "flat"]);
  for (const value of [-1, NaN, Infinity, 1.2, 1e12 + 1]) expect(salesPriceDirection(value, 1000)).toBeNull();
  for (const value of [null, {}, { direction: "up", cost: 999 }, "UP", 1]) expect(publicSalesPriceDirection(value)).toBeNull();
});
it("uses only immutable published price, preserving documents and private inputs", () => {
  const before = document(1000), current = document(1100);
  Object.assign(current.lines[0], { cost: 1, marginPercent: -200 });
  const saved = JSON.stringify([before, current]);
  expect([...publishedPriceDirections(current, before).values()]).toEqual(["up"]);
  expect(JSON.stringify([before, current])).toBe(saved);
});
it("hides mismatched, ambiguous, invisible and unavailable comparisons", () => {
  for (const patch of [{ productId: "other" }, { unit: "box" }, { spec: "2kg" }, { taxType: "taxable" }, { taxType: "unknown" }, { promotionId: "promo" }, { visible: false }, { price: null }]) {
    const before = document(1000);
    Object.assign(before.lines[0], patch);
    expect(publishedPriceDirections(document(1100), before).size).toBe(0);
  }
  for (const patch of [{ recipient: "other" }, { kind: "quote" }, { showPrice: false }]) {
    expect(publishedPriceDirections(document(1100), Object.assign(document(1000), patch)).size).toBe(0);
  }
  const duplicate = document(1000); duplicate.lines.push({ ...duplicate.lines[0] });
  expect(publishedPriceDirections(document(1100), duplicate).size).toBe(0);
  expect(publishedPriceDirections(duplicate, document(900)).size).toBe(0);
  expect(publishedPriceDirections(document(1100), null).size).toBe(0);
});
it("does not query history with master OFF, no company opt-in, or first version", async () => {
  const current = { document_id: "doc", version: 2, content: document(1100) };
  vi.stubEnv("STOREFRONT_PRICE_DIRECTION_ENABLED", "false");
  expect((await readPublishedPriceDirections("company", true, current)).size).toBe(0);
  vi.stubEnv("STOREFRONT_PRICE_DIRECTION_ENABLED", "true");
  await readPublishedPriceDirections("company", false, current);
  await readPublishedPriceDirections("company", true, { ...current, version: 1 });
  expect(db).not.toHaveBeenCalled();
});
it("pins company, document and exact previous version, never latest live prices", async () => {
  db.mockResolvedValue([{ version: 2, content: document(1000) }]);
  const current = { document_id: "doc", version: 3, content: document(1100) };
  expect((await readPublishedPriceDirections("company", true, current)).get(publishedPriceKey(line))).toBe("up");
  expect(db).toHaveBeenCalledWith("pricing_document_versions?company_id=eq.company&document_id=eq.doc&version=eq.2&select=version,content&limit=1");
  db.mockResolvedValue([{ version: 1, content: document(500) }]);
  expect((await readPublishedPriceDirections("company", true, current)).size).toBe(0);
  db.mockRejectedValue(new Error("history unavailable"));
  expect((await readPublishedPriceDirections("company", true, current)).size).toBe(0);
});
