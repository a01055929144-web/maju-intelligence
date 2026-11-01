import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parseCustomerItemImport } from "../domains/customer/customer-item-import";
import { importCustomerItems } from "../application/customer/import-customer-items";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), db: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { POST } from "../app/api/customers/items/import/route";
const company = "00000000-0000-4000-8000-000000000001";
const row = { customerId: "00000000-0000-4000-8000-000000000002", productId: "00000000-0000-4000-8000-000000000003", salesUnit: "kg", lastPrice: 0, lastDate: "2026-10-30", taxType: "unknown", priceIncludesTax: null };
const request = (body: unknown = { rows: [row] }) => new NextRequest("http://localhost/api/customers/items/import", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CUSTOMER_ITEMS_IMPORT_ENABLED", "true");
  vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS", company);
  mocks.auth.mockResolvedValue({ ok: true, companyId: company });
  mocks.capability.mockReturnValue(true);
  mocks.db.mockResolvedValue({ applied: 1, skipped: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("actual customer item import boundary", () => {
  it("defaults OFF and never authenticates or touches new schema", async () => {
    delete process.env.CUSTOMER_ITEMS_IMPORT_ENABLED;
    expect((await POST(request())).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects anonymous, unauthorized and non-allowlisted companies", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false });
    expect((await POST(request())).status).toBe(401);
    mocks.capability.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS", "");
    expect((await POST(request())).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("uses authenticated company and sends only actual values to one RPC", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), "manage_sales");
    expect(mocks.db).toHaveBeenCalledExactlyOnceWith("rpc/import_customer_items", {
      method: "POST", body: JSON.stringify({ p_company: company, p_rows: [{ customer_id: row.customerId, product_id: row.productId, sales_unit: "kg", last_price: 0, last_date: row.lastDate, tax_type: "unknown", price_includes_tax: null }] }),
    });
  });
  it("rejects forged scope, base/fixed price fields, malformed JSON and oversized input", async () => {
    expect((await POST(request({ companyId: "other", rows: [row] }))).status).toBe(400);
    expect((await POST(request({ rows: [{ ...row, basePrice: 100 }] }))).status).toBe(400);
    expect((await POST(new NextRequest("http://localhost/api/customers/items/import", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ rows: [], padding: "x".repeat(512_000) }))).status).toBe(413);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reports database failure without raw SQL, prices or identifiers", async () => {
    mocks.db.mockRejectedValue(new Error("private imported price and database details"));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("private");
  });
});

it.each([
  { lastPrice: -1 }, { lastPrice: 1.2 }, { lastPrice: Number.NaN }, { lastPrice: 1_000_000_000_001 },
  { lastDate: "2026-02-30" }, { lastDate: "9999-01-01" }, { lastDate: "2026-1-01" },
  { salesUnit: " " }, { customerId: "bad" }, { taxType: "unknown", priceIncludesTax: false },
  { taxType: "taxable", priceIncludesTax: null }, { lastPrice: "100" },
])("rejects invalid input before any write: %j", async patch => {
  const write = vi.fn();
  expect(() => importCustomerItems(company, [{ ...row, ...patch }], write)).toThrow();
  expect(write).not.toHaveBeenCalled();
});

it("normalizes unit whitespace, rejects duplicate keys, and keeps units separate", () => {
  expect(parseCustomerItemImport([{ ...row, salesUnit: " kg " }])[0].salesUnit).toBe("kg");
  expect(() => parseCustomerItemImport([row, { ...row, salesUnit: " kg " }])).toThrow();
  expect(parseCustomerItemImport([row, { ...row, salesUnit: "box" }])).toHaveLength(2);
  expect(() => parseCustomerItemImport([])).toThrow();
  expect(() => parseCustomerItemImport(Array(1001).fill(row))).toThrow();
});
