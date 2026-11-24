import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn(), capability: vi.fn(), feature: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth, customerHasCapability: mocks.capability }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
import { readStoreSignupStatus } from "../lib/store/07-store-signup-status";
import { GET } from "../app/api/store-signups/route";

const c1 = "00000000-0000-4000-8000-000000000001";
const L1 = "10000000-0000-4000-8000-000000000001", L2 = "10000000-0000-4000-8000-000000000002";
const K1 = "20000000-0000-4000-8000-000000000001", K2 = "20000000-0000-4000-8000-000000000002", K3 = "20000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.clearAllMocks(); mocks.feature.mockReturnValue(true); mocks.capability.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ ok: true, companyId: c1, customerSession: { workspaceRole: "owner" } });
  mocks.db.mockImplementation(async (path: string) => {
    expect(path).toContain(`company_id=eq.${c1}`);
    if (path.startsWith("lead_actions?")) return [{ lead_id: L1 }, { lead_id: L2 }];
    if (path.startsWith("business_permit_leads?")) return [{ id: L1, matched_customer_id: K1 }, { id: L2, matched_customer_id: K2 }];
    if (path.startsWith("store_orders?")) return [{ customer_id: K2 }];
    if (path.startsWith("store_accounts?")) return [{ customer_id: K1 }, { customer_id: K2 }, { customer_id: K3 }];
    return [];
  });
});

describe("CX-142 store signup status", () => {
  it("shows 가입·첫 주문 전 until the first order, then 주문 시작, and counts new stores without orders", async () => {
    expect(await readStoreSignupStatus(c1, Date.parse("2026-11-25T00:00:00Z"))).toEqual({ newCount: 2, leads: { [L1]: "signed_up", [L2]: "ordering" } });
    expect(mocks.db.mock.calls.some(call => String(call[0]).includes("created_at=gte.2026-11-18T00%3A00%3A00.000Z"))).toBe(true);
  });
  it("is hidden for companies without the flag and for non-sales customers; the company comes only from the session", async () => {
    mocks.feature.mockReturnValue(false);
    expect((await GET(new NextRequest("https://app.test/api/store-signups?companyId=00000000-0000-4000-8000-0000000000ff"))).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
    mocks.feature.mockReturnValue(true); mocks.capability.mockReturnValue(false);
    expect((await GET(new NextRequest("https://app.test/api/store-signups"))).status).toBe(403);
    mocks.capability.mockReturnValue(true);
    const response = await GET(new NextRequest("https://app.test/api/store-signups?companyId=00000000-0000-4000-8000-0000000000ff"));
    expect(response.status).toBe(200); expect((await response.json()).newCount).toBe(2);
  });
});
