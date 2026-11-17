import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
import { readPriceExplanation, searchPriceExplanationOptions } from "../lib/pricing/price-explanation";

const company = "00000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000001";
const product = "20000000-0000-4000-8000-000000000001";

beforeEach(() => db.mockReset());

describe("price explanation reads the existing server decision", () => {
  it("keeps every search company-scoped and sanitizes PostgREST syntax", async () => {
    db.mockResolvedValue([]);
    await searchPriceExplanationOptions(company, " 매장*,% ", " 양파() ");
    expect(db).toHaveBeenCalledTimes(2);
    for (const [path] of db.mock.calls) expect(path).toContain(`company_id=eq.${company}`);
    const paths = db.mock.calls.map(([path]) => String(path)).join("\n");
    expect(paths).not.toContain("%2A");
    expect(paths).not.toContain("%25");
  });

  it("explains agreement first without recalculating any price", async () => {
    db.mockImplementation(async (path?: string) => {
      if (!path) return [];
      if (path.startsWith("normalized_customers?")) return [{ id: customer, customer_name: "한결식당", address: "서울" }];
      if (path.startsWith("product_catalog?")) return [{ id: product, sales_product_name: "양파", sales_spec: "10kg", sales_unit: "BOX", order_pricing_mode: "fixed" }];
      if (path.startsWith("customer_price_agreements?")) return [{ unit_price: 9100, sales_unit: "BOX", source_quote_id: "quote" }];
      if (path === "rpc/margin_template_price_v1") return 9800;
      if (path.startsWith("pricing_p0_effective?")) return [{ price: 10500 }];
      if (path.startsWith("pricing_promotions?")) return [{ id: "30000000-0000-4000-8000-000000000001", display_name: "주말 행사", name: "행사", price: 8500, ends_on: "2099-12-31", badge: "행사", stock: 10 }];
      if (path === "rpc/promotion_applies_to") return true;
      return [];
    });
    const result = await readPriceExplanation(company, customer, product, "2099-01-01");
    expect(result?.current).toEqual({ price: 9100, source: "store" });
    expect(result?.agreement).toEqual({ price: 9100, acceptedQuote: true });
    expect(result?.promotions).toEqual([expect.objectContaining({ price: 8500 })]);
    expect(db.mock.calls.filter(([path]) => String(path).includes("company_id=eq.")).every(([path]) => String(path).includes(company))).toBe(true);
  });

  it("falls through to the server grade result, then base price", async () => {
    db.mockImplementation(async (path?: string) => {
      if (!path) return [];
      if (path.startsWith("normalized_customers?")) return [{ id: customer, customer_name: "한결식당", address: null }];
      if (path.startsWith("product_catalog?")) return [{ id: product, canonical_name: "양파", sales_unit: "BOX", order_pricing_mode: "fixed" }];
      if (path.startsWith("customer_price_agreements?")) return [];
      if (path === "rpc/margin_template_price_v1") return 9800;
      if (path.startsWith("pricing_p0_effective?")) return [{ price: 10500 }];
      if (path.startsWith("pricing_promotions?")) return [];
      return [];
    });
    expect((await readPriceExplanation(company, customer, product, "2099-01-01"))?.current).toEqual({ price: 9800, source: "grade" });
  });

  it("does not read fixed prices for a market-priced product", async () => {
    db.mockImplementation(async (path?: string) => path?.startsWith("normalized_customers?")
      ? [{ id: customer, customer_name: "한결식당", address: null }]
      : [{ id: product, canonical_name: "활어", sales_unit: "kg", order_pricing_mode: "market" }]);
    const result = await readPriceExplanation(company, customer, product, "2099-01-01");
    expect(result?.product.market).toBe(true);
    expect(result?.current).toBeNull();
    expect(db).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed IDs before reading data", async () => {
    expect(await readPriceExplanation(company, "not-an-id", product)).toBeNull();
    expect(db).not.toHaveBeenCalled();
  });
});
