import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(() => true), supabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
import { DELETE, POST } from "../app/api/price-sheets/excluded-codes/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const post = (items: unknown) => new NextRequest("http://localhost/api/price-sheets/excluded-codes", { method: "POST", body: JSON.stringify({ items }) });

describe("excluded codes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capability.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "owner", workspaceRole: "owner" } });
  });

  it("rejects without manage_sales before touching the database", async () => {
    mocks.capability.mockReturnValue(false);
    expect((await POST(post([{ code: "A" }]))).status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("inserts only new codes for the signed-in company and skips duplicates ignoring case", async () => {
    mocks.supabase.mockResolvedValueOnce([{ id: "1", code: "ab", supplier_id: null }]).mockResolvedValueOnce([{ id: "s1", name: "가나다" }]).mockResolvedValueOnce([]);
    const response = await POST(post([{ code: "AB" }, { code: "Z9", supplierName: "가나다" }]));
    expect((await response.json()).added).toBe(1);
    const rows = JSON.parse(mocks.supabase.mock.calls[2][1].body);
    expect(rows).toEqual([expect.objectContaining({ company_id: companyId, supplier_id: "s1", code: "Z9" })]);
  });

  it("refuses an unknown supplier instead of widening to the whole company", async () => {
    mocks.supabase.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await POST(post([{ code: "A", supplierName: "없음" }]))).status).toBe(400);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
  });

  it("deletes only inside the signed-in company", async () => {
    mocks.supabase.mockResolvedValueOnce([]);
    const id = "11111111-1111-4111-8111-111111111111";
    await DELETE(new NextRequest(`http://localhost/api/price-sheets/excluded-codes?id=${id}`, { method: "DELETE" }));
    expect(mocks.supabase.mock.calls[0][0]).toContain(`company_id=eq.${companyId}`);
  });
});
