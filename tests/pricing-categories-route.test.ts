import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
vi.mock("@/domains/pricing/product-category", () => ({ categoryOptions: () => [], suggestCategory: () => "" }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(() => true), supabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
import { GET } from "../app/api/price-sheets/categories/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const row = (id: number) => ({ id: String(id), product_code: String(id), canonical_name: `상품 ${id}`, purchase_product_name: null, sales_spec: null, sales_unit: null, category: null });

describe("pricing category catalog paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capability.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "owner", workspaceRole: "owner" } });
  });

  it("loads every active product page before allowing whole-category edits", async () => {
    mocks.supabase.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, index) => row(index))).mockResolvedValueOnce([row(1000)]);
    const response = await GET(new NextRequest("http://localhost/api/price-sheets/categories"));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1001);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.supabase.mock.calls[0][0]).toContain("limit=1000&offset=0");
    expect(mocks.supabase.mock.calls[1][0]).toContain("limit=1000&offset=1000");
    expect(mocks.supabase.mock.calls[1][0]).toContain(`company_id=eq.${companyId}`);
  });

  it("does not expose the catalog after manage_sales is revoked", async () => {
    mocks.capability.mockReturnValue(false);
    const response = await GET(new NextRequest("http://localhost/api/price-sheets/categories"));
    expect(response.status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});
