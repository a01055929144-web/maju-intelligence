import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), feature: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { POST } from "../app/api/mobile/driver-stop-outcomes/route";

const companyId = "00000000-0000-4000-8000-000000000001", stopId = "10000000-0000-4000-8000-000000000001", attachmentId = "20000000-0000-4000-8000-000000000001";
const request = (patch = {}) => new NextRequest("https://test/api/mobile/driver-stop-outcomes", { method: "POST", headers: { origin: "https://test" }, body: JSON.stringify({ stopId, outcome: "partial", reasonCode: "quantity_short", detail: "양파 1망 부족", attachmentIds: [attachmentId], ...patch }) });

describe("driver stop outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.feature.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { companyMemberId: "member-a", duties: ["delivery"] } });
    mocks.db.mockResolvedValueOnce([{ id: stopId, customer_id: "customer-a", order_id: "order-a", status: "arrived", arrived_at: "2026-11-17T00:00:00Z", reason_code: null, reason_detail: null }])
      .mockResolvedValueOnce([{ id: stopId }])
      .mockResolvedValueOnce([{ id: attachmentId, mime_type: "image/jpeg", storage_path: `${companyId}/customer-a/proof.jpg` }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
  });
  it("is default-off before reading a stop", async () => { mocks.feature.mockReturnValue(false); expect((await POST(request())).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled(); });
  it("scopes the stop to the verified driver and writes an idempotent distributor alert", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.db.mock.calls[0][0]).toContain("driver_member_id=eq.member-a");
    expect(mocks.db.mock.calls[1][1].body).toContain('"status":"partial"');
    expect(mocks.db.mock.calls[4][0]).toBe("delivery_route_stop_photos");
    expect(mocks.db.mock.calls[4][1].body).toContain('"order_id":"order-a"');
    expect(mocks.db.mock.calls[5][0]).toContain("company_notifications?on_conflict=company_id,idempotency_key");
    mocks.db.mockReset().mockResolvedValueOnce([{ id: stopId, customer_id: "customer-a", order_id: "order-a", status: "partial", arrived_at: "2026-11-17T00:00:00Z", reason_code: "quantity_short", reason_detail: "양파 1망 부족" }])
      .mockResolvedValueOnce([{ id: attachmentId, mime_type: "image/jpeg", storage_path: `${companyId}/customer-a/proof.jpg` }])
      .mockResolvedValueOnce([{ storage_path: `${companyId}/customer-a/proof.jpg`, sort_order: 1 }])
      .mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.db.mock.calls[3][0]).toContain("company_notifications?on_conflict=company_id,idempotency_key");
  });
  it("rejects a reason from the wrong category", async () => { expect((await POST(request({ reasonCode: "damaged" }))).status).toBe(400); expect(mocks.db).not.toHaveBeenCalled(); });
});
