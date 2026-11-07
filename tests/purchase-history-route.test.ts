import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/domains/pricing/purchase-receipt", () => import("../domains/pricing/purchase-receipt"));
vi.mock("@/lib/run-limited", () => ({ runLimited: vi.fn() }));
import { GET, PATCH, POST } from "../app/api/price-sheets/receipts/route";

const company = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true");
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company);
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { role: "owner" } });
  mocks.db.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it("filters by company, date, item and search before paging", async () => {
  const url = `https://example.test/api/price-sheets/receipts?companyId=forged&from=2026-10-01&to=2026-11-05&search=%EB%91%90%EB%B6%80&page=2&productId=${company}`;
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(200);
  const query = String(mocks.db.mock.calls[0][0]);
  expect(query).toContain(`company_id=eq.${company}`);
  expect(query).toContain("receipt_date=gte.2026-10-01");
  expect(query).toContain("receipt_date=lte.2026-11-05");
  expect(query).toContain(`product_catalog_id=eq.${company}`);
  expect(query).toContain("offset=0");
  expect(query).toContain("limit=1000");
  expect(query).not.toContain("forged");
});

it("loads an item without excluding older receipts whose supplier column was empty", async () => {
  const response = await GET(new NextRequest("https://example.test/api/price-sheets/receipts?lineKey=name%7Cspec&supplier=%ED%95%9C%EB%B9%9B"));
  expect(response.status).toBe(200);
  const query = String(mocks.db.mock.calls[0][0]);
  expect(query).toContain("line_key=eq.name%7Cspec");
  expect(query).not.toContain("supplier_name=eq.");
  expect(query).not.toContain("or=(product_name.ilike");
});

it("returns a next page only when more than 100 records exist", async () => {
  mocks.db.mockResolvedValue(Array.from({ length: 101 }, (_, id) => ({ id })));
  const response = await GET(new NextRequest("https://example.test/api/price-sheets/receipts"));
  const payload = await response.json();
  expect(payload.hasMore).toBe(true);
  expect(payload.rows).toHaveLength(100);
});

it("filters changed purchase items before pagination", async () => {
  const receipt = (id: string, key: string, date: string, cost: number) => ({ id, line_key: key, product_name: key, receipt_date: date,
    spec: null, unit: "EA", supplier_name: null, quantity: 1, unit_cost_ex_vat: cost });
  mocks.db.mockImplementation(async (path: string) => path.startsWith("purchase_receipt_lines?") ? [
    receipt("a2", "changed", "2026-11-05", 120), receipt("a1", "changed", "2026-11-04", 100), receipt("b1", "same", "2026-11-05", 100)
  ] : []);
  const response = await GET(new NextRequest("https://example.test/api/price-sheets/receipts?changed=1"));
  const payload = await response.json();
  expect(payload.rows.map((row: { id: string }) => row.id)).toEqual(["a2", "a1"]);
  expect(payload.hasMore).toBe(false);
});

it("rejects invalid dates without reading data", async () => {
  expect((await GET(new NextRequest("https://example.test/api/price-sheets/receipts?from=2026-11-06&to=2026-11-05"))).status).toBe(400);
  expect((await GET(new NextRequest("https://example.test/api/price-sheets/receipts?from=2026-02-30"))).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("keeps correction writes closed until the company flag is enabled", async () => {
  const body = { id: company, cost: 900, reason: "엑셀 단가 오류", expectedRevision: 0 };
  const request = () => new NextRequest("https://example.test/api/price-sheets/receipts", { method: "PATCH", body: JSON.stringify(body) });
  expect((await PATCH(request())).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
  vi.stubEnv("PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS", company);
  mocks.db.mockResolvedValue({ revision: 1 });
  expect((await PATCH(request())).status).toBe(200);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/correct_purchase_receipt_line");
});

it("shows the corrected effective item while retaining the raw receipt row", async () => {
  vi.stubEnv("PURCHASE_RECEIPT_CORRECTIONS_COMPANY_IDS", company);
  mocks.db.mockResolvedValue([{ id: company, product_catalog_id: company, product_name: "정정", spec: "1kg", unit: "봉",
    unit_cost_ex_vat: 90, correction_revision: 1, corrected: true }]);
  const response = await GET(new NextRequest("https://example.test/api/price-sheets/receipts"));
  expect(await response.json()).toMatchObject({ canCorrect: true, rows: [{ product_name: "정정", unit_cost_ex_vat: 90, corrected: true }] });
  expect(String(mocks.db.mock.calls[0][0])).toContain("purchase_receipt_effective?");
});

it("reports how many receipt rows remain after a later chunk fails", async () => {
  vi.stubEnv("FEATURE_PURCHASE_RECEIPT_SOURCE_ROW_COMPANY_IDS", company);
  let writes = 0;
  mocks.db.mockImplementation(async (path: string) => {
    if (!path.startsWith("purchase_receipt_lines?")) return [];
    writes += 1;
    if (writes === 2) throw new Error("write failed");
    return [];
  });
  const lines = Array.from({ length: 501 }, (_, index) => ({ name: `품목 ${index}`, rawCost: 100, cost: 100, rowNumber: index + 2 }));
  const response = await POST(new NextRequest("https://example.test/api/price-sheets/receipts", {
    method: "POST", body: JSON.stringify({ fileName: "매입.xlsx", lines, receiptDate: "2026-11-07" })
  }));
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ failed: 1, saved: 500 });
});
