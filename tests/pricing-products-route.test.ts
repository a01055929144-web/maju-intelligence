import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: (session: { role?: string; workspaceRole?: string }) => ["owner", "manager"].includes(session.workspaceRole || session.role || "") }));
vi.mock("@/domains/pricing/purchase-receipt", () => ({ buildProductFieldPatch: () => ({ values: {} }) }));
vi.mock("@/lib/run-limited", () => ({ runLimited: vi.fn() }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(() => true), supabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
import { PATCH } from "../app/api/price-sheets/products/route";

const companyId = "00000000-0000-4000-8000-000000000001";

describe("pricing product category write permission", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.capability.mockReturnValue(true); });

  it("rejects a manager whose manage_sales capability was revoked", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "member", workspaceRole: "manager" } });
    mocks.capability.mockReturnValue(false);
    const response = await PATCH(new NextRequest("http://localhost/api/price-sheets/products", { method: "PATCH", body: JSON.stringify({ companyId, items: [] }) }));
    expect(response.status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it.each(["sales", "member", "temporary"])("rejects a revoked %s session before product writes", async (workspaceRole) => {
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "member", workspaceRole } });
    const response = await PATCH(new NextRequest("http://localhost/api/price-sheets/products", {
      method: "PATCH",
      body: JSON.stringify({ companyId, items: [{ id: "30000000-0000-4000-8000-000000000001", category: "농산 > 채소류" }] }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});
