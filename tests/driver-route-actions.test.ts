import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), feature: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { DELETE, PATCH, POST } from "../app/api/mobile/driver-route-actions/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const customerA = "10000000-0000-4000-8000-000000000001", customerB = "10000000-0000-4000-8000-000000000002";
const stopA = "20000000-0000-4000-8000-000000000001", stopB = "20000000-0000-4000-8000-000000000002";
const request = (method: "POST" | "PATCH" | "DELETE", body: object) => new NextRequest("https://test/api/mobile/driver-route-actions", { method, headers: { origin: "https://test" }, body: JSON.stringify(body) });

describe("driver route actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.feature.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { companyMemberId: "driver-a", duties: ["delivery"] } });
  });
  it("reorders every planned delivery stop through one atomic rpc", async () => {
    mocks.db.mockResolvedValueOnce([
      { customer_id: customerA, id: stopA, status: "planned", stop_order: 2, stop_type: "delivery" },
      { customer_id: customerB, id: stopB, status: "planned", stop_order: 4, stop_type: "delivery" },
    ]).mockResolvedValueOnce(null);
    expect((await POST(request("POST", { customerIds: [customerB, customerA] }))).status).toBe(200);
    expect(mocks.db.mock.calls[1][0]).toBe("rpc/reorder_driver_delivery_stops");
    expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toMatchObject({ p_stop_ids: [stopB, stopA], p_stop_orders: [2, 4] });
  });
  it("blocks reorder after any route stop has started", async () => {
    mocks.db.mockResolvedValueOnce([{ customer_id: customerA, id: stopA, status: "arrived", stop_order: 1, stop_type: "delivery" }]);
    expect((await POST(request("POST", { customerIds: [customerA] }))).status).toBe(409);
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
  it("passes the exact completion token to the five-second undo rpc", async () => {
    mocks.db.mockResolvedValueOnce(null);
    const completedAt = "2026-11-17T10:00:00.000Z";
    expect((await DELETE(request("DELETE", { stopId: stopA, completedAt }))).status).toBe(200);
    expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toMatchObject({ p_company_id: companyId, p_driver_member_id: "driver-a", p_stop_id: stopA, p_completed_at: completedAt });
  });
  it("completes only this driver's remaining delivery stops in one update", async () => {
    mocks.db.mockResolvedValueOnce([
      { customer_id: customerA, id: stopA, status: "planned", stop_type: "delivery" },
      { customer_id: customerB, id: stopB, status: "arrived", stop_type: "delivery" },
    ]).mockResolvedValueOnce([{ id: stopA }, { id: stopB }]);
    const response = await PATCH(request("PATCH", { customerIds: [customerA, customerB] }));
    expect(response.status).toBe(200);
    expect(mocks.db.mock.calls[1][0]).toContain(`driver_member_id=eq.driver-a`);
    expect(mocks.db.mock.calls[1][0]).toContain(`id=in.(${stopA},${stopB})`);
    expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toMatchObject({ status: "completed" });
  });
  it("rejects bulk completion when a requested stop is no longer pending", async () => {
    mocks.db.mockResolvedValueOnce([{ customer_id: customerA, id: stopA, status: "completed", stop_type: "delivery" }]);
    expect((await PATCH(request("PATCH", { customerIds: [customerA] }))).status).toBe(409);
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
  it("reuses the five-second undo rpc for every stop in a bulk completion", async () => {
    mocks.db.mockResolvedValue(null);
    const completedAt = "2026-11-18T10:00:00.000Z";
    expect((await DELETE(request("DELETE", { stopIds: [stopA, stopB], completedAt }))).status).toBe(200);
    expect(mocks.db).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.db.mock.calls[1][1].body).p_stop_id).toBe(stopB);
  });
});
