import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { POST } from "../app/api/store/order-receipts/route";

const ids = {
  companyId: "00000000-0000-4000-8000-000000000001",
  storeAccountId: "20000000-0000-4000-8000-000000000001",
  orderId: "30000000-0000-4000-8000-000000000001",
  documentId: "40000000-0000-4000-8000-000000000001",
};
const request = (patch: Record<string, unknown> = {}, origin = "https://test") => new NextRequest("https://test/api/store/order-receipts", {
  method: "POST", headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({ ...ids, revision: 2, status: "confirmed", ...patch }),
});

describe("store order receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.context.mockResolvedValue({ companyId: ids.companyId, storeAccountId: ids.storeAccountId, memberId: "50000000-0000-4000-8000-000000000001" });
    mocks.db.mockResolvedValueOnce([{ customer_id: "60000000-0000-4000-8000-000000000001" }])
      .mockResolvedValueOnce([{ id: ids.orderId }]).mockResolvedValueOnce([{ id: ids.documentId }])
      .mockResolvedValueOnce({ id: "receipt" });
  });

  it("is closed by default rollout and rejects cross-origin writes", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.context).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true);
    expect((await POST(request({}, "https://other.test"))).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("records the verified member, document revision, and receipt status through CX-38 RPC", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.context).toHaveBeenCalledWith({ companyId: ids.companyId, storeAccountId: ids.storeAccountId });
    expect(mocks.db.mock.calls[1][0]).toContain("status=eq.delivered");
    expect(mocks.db).toHaveBeenLastCalledWith("rpc/record_business_document_receipt", expect.objectContaining({
      method: "POST", body: expect.stringContaining('"p_revision":2'),
    }));
    expect(JSON.parse(mocks.db.mock.calls.at(-1)![1].body)).toMatchObject({
      p_company_id: ids.companyId, p_document_id: ids.documentId, p_store_account_id: ids.storeAccountId,
      p_store_member_id: "50000000-0000-4000-8000-000000000001", p_status: "confirmed",
    });
  });

  it("requires a memo for an issue report before any membership or database access", async () => {
    expect((await POST(request({ status: "disputed", memo: "" }))).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
