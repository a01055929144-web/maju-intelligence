import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// CC-30b: 매장 개별 가격(customer_price_agreements, source_quote_id 없음) 저장 규칙.
const calls: Array<{ path: string; method: string; body: Record<string, unknown> | undefined }> = [];
let customerFound = true, productRow: { id: string; sales_unit: string | null; tax_type: string | null } | undefined, activeRows: Array<{ id: string; source_quote_id: string | null; effective_from: string; sales_unit: string }> = [];
vi.mock("../lib/store", () => ({
  supabaseRequest: async (path: string, init?: { method?: string; body?: string }) => {
    calls.push({ path, method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    if (path.startsWith("normalized_customers")) return customerFound ? [{ id: "c" }] : [];
    if (path.startsWith("product_catalog")) return productRow ? [productRow] : [];
    if (path.startsWith("customer_price_agreements?select")) return activeRows;
    return [];
  },
}));

const cust = "00000000-0000-4000-8000-0000000000c1", prod = "00000000-0000-4000-8000-0000000000a1";
const day = (offset = 0) => new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const writes = () => calls.filter((c) => c.method !== "GET");

describe("setStorePrice", () => {
  afterEach(() => { calls.length = 0; customerFound = true; productRow = { id: prod, sales_unit: "BOX", tax_type: "exempt" }; activeRows = []; });
  productRow = { id: prod, sales_unit: "BOX", tax_type: "exempt" };

  it("saves a valid end date and rejects a wrong-format or past one", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    await expect(setStorePrice("co", cust, prod, 1200, "합성", day(5))).resolves.toEqual({ ended: 0, created: true });
    expect(writes()[0].body).toMatchObject({ effective_until: day(5) });
    await expect(setStorePrice("co", cust, prod, 1200, "합성", "내일")).rejects.toThrow();
    await expect(setStorePrice("co", cust, prod, 1200, "합성", day(-1))).rejects.toThrow();
  });

  it("a future start keeps the current price active until the day before and replaces an earlier scheduled one", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    activeRows = [{ id: "now", source_quote_id: null, effective_from: day(-10), sales_unit: "BOX" }, { id: "plan", source_quote_id: null, effective_from: day(3), sales_unit: "BOX" }];
    await setStorePrice("co", cust, prod, 1500, "합성", null, day(7));
    const [a, b, c] = writes();
    expect(a.path).toContain("id=eq.now"); expect(a.body).toEqual(expect.objectContaining({ effective_until: day(6) })); expect(a.body).not.toHaveProperty("status");
    expect(b.path).toContain("id=eq.plan"); expect(b.body).toMatchObject({ status: "cancelled" });
    expect(c.body).toMatchObject({ unit_price: 1500, effective_from: day(7), effective_until: null, status: "active" });
  });
  it("price null with a future from cancels only the scheduled price; bad start or end-before-start is refused", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    activeRows = [{ id: "now", source_quote_id: null, effective_from: day(-10), sales_unit: "BOX" }, { id: "plan", source_quote_id: null, effective_from: day(3), sales_unit: "BOX" }];
    await expect(setStorePrice("co", cust, prod, null, "합성", null, day(3))).resolves.toEqual({ ended: 1, created: false });
    expect(writes()).toHaveLength(1); expect(writes()[0].path).toContain("id=eq.plan");
    await expect(setStorePrice("co", cust, prod, 1500, "합성", null, day(-1))).rejects.toThrow();
    await expect(setStorePrice("co", cust, prod, 1500, "합성", day(2), day(5))).rejects.toThrow();
  });

  it("creates a store price starting today with the product's unit and tax type", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    await expect(setStorePrice("co", cust, prod, 1200, "합성")).resolves.toEqual({ ended: 0, created: true });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toMatchObject({ company_id: "co", customer_id: cust, product_catalog_id: prod, sales_unit: "BOX", unit_price: 1200, tax_type: "exempt", price_includes_tax: false, effective_from: day(), effective_until: null, status: "active" });
  });
  it("replaces an older store price: ends it yesterday, cancels one that starts today or later, then adds the new one", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    activeRows = [{ id: "old", source_quote_id: null, effective_from: day(-10), sales_unit: "BOX" }, { id: "same-day", source_quote_id: null, effective_from: day(), sales_unit: "BOX" }];
    await setStorePrice("co", cust, prod, 900);
    const [a, b, c] = writes();
    expect(a.path).toContain("id=eq.old"); expect(a.body).toMatchObject({ status: "ended", effective_until: day(-1) });
    expect(b.path).toContain("id=eq.same-day"); expect(b.body).toMatchObject({ status: "cancelled" }); expect(b.body).not.toHaveProperty("effective_until");
    expect(c.method).toBe("POST"); expect(c.body).toMatchObject({ unit_price: 900 });
  });
  it("price null only ends the existing store price", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    activeRows = [{ id: "old", source_quote_id: null, effective_from: day(-3), sales_unit: "BOX" }];
    await expect(setStorePrice("co", cust, prod, null)).resolves.toEqual({ ended: 1, created: false });
    expect(writes().map((w) => w.method)).toEqual(["PATCH"]);
  });
  it("never overwrites a price made by an accepted quote", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    activeRows = [{ id: "q", source_quote_id: "quote-1", effective_from: day(-3), sales_unit: "BOX" }];
    await expect(setStorePrice("co", cust, prod, 1000)).rejects.toMatchObject({ status: 409 });
    expect(writes()).toHaveLength(0);
  });
  it("rejects bad input and unknown store/product before writing anything", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    await expect(setStorePrice("co", "x", prod, 1)).rejects.toThrow("확인");
    await expect(setStorePrice("co", cust, prod, -1)).rejects.toThrow("원 단위");
    await expect(setStorePrice("co", cust, prod, 10.5)).rejects.toThrow("원 단위");
    customerFound = false;
    await expect(setStorePrice("co", cust, prod, 1)).rejects.toMatchObject({ status: 404 });
    customerFound = true; productRow = undefined;
    await expect(setStorePrice("co", cust, prod, 1)).rejects.toMatchObject({ status: 404 });
    expect(writes()).toHaveLength(0);
  });
  it("a product without unit or tax type is refused before the old price is ended", async () => {
    const { setStorePrice } = await import("../lib/pricing/store-price-agreement");
    productRow = { id: prod, sales_unit: " ", tax_type: "exempt" };
    activeRows = [{ id: "old", source_quote_id: null, effective_from: day(-3), sales_unit: "BOX" }];
    await expect(setStorePrice("co", cust, prod, 500)).rejects.toThrow("판매 단위");
    productRow = { id: prod, sales_unit: "BOX", tax_type: null };
    await expect(setStorePrice("co", cust, prod, 500)).rejects.toThrow("과세");
    expect(writes()).toHaveLength(0);
  });
});

describe("store price route gate", () => {
  const route = readFileSync("app/api/customers/[id]/contract-prices/route.ts", "utf8");
  it("only owners/managers may set store prices", () => {
    expect(route).toContain("export async function POST");
    expect(route).toContain("canManagePriceSheets(scope.customerSession)");
    expect(route).toContain("status: 403");
  });
});
