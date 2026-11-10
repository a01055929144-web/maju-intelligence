import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), enabled: vi.fn(() => true), manage: vi.fn(() => true), supabase: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: mocks.manage }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
import { GET, POST } from "../app/api/orders/route";
import { canConfirmStoreOrder, storeOrderStatusLabel } from "../domains/order/store-order-status";

const companyId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-0000000000aa";
const customer = { ok: true, companyId, customerSession: { role: "owner", workspaceRole: "owner" } };
const confirm = (body: Record<string, unknown> = {}) => POST(new NextRequest("http://localhost/api/orders", {
  method: "POST", body: JSON.stringify({ action: "confirm", orderId, revision: 2, ...body }),
}));

describe("order inbox API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabase.mockReset();
    mocks.enabled.mockReturnValue(true);
    mocks.manage.mockReturnValue(true);
    mocks.auth.mockResolvedValue(customer);
  });

  const orderRow = (member: string | null) => ({ id: orderId, customer_id: "c1", delivery_date: "2026-11-12", status: "submitted", known_total: 12000,
    has_market_price: false, request_memo: "", submitted_at: "2026-11-10T01:00:00Z", revision: 1, ordered_by_member_id: member, store_order_lines: [] });
  const routeFor = (path: string) => {
    if (path.startsWith("store_orders?")) return [orderRow("m1")];
    if (path.startsWith("normalized_customers?") && path.includes("ilike")) return [{ id: "c1" }];
    if (path.startsWith("normalized_customers?")) return [{ id: "c1", customer_name: "송파 시험 매장", address: "옛 주소", delivery_base_address: "서울 송파구 합성로 1", delivery_address_detail: "101호" }];
    if (path.startsWith("store_account_members?")) return [{ id: "m1", role: "owner", app_users: { name: "합성 점주" } }];
    throw new Error(`unexpected ${path}`);
  };

  it("lists only this company's new orders with store, delivery address and orderer", async () => {
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    const response = await GET(new NextRequest("http://localhost/api/orders"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items[0]).toMatchObject({ customerName: "송파 시험 매장", status: "submitted",
      deliveryAddress: "서울 송파구 합성로 1 101호", orderedBy: "합성 점주 · 점주" });
    expect(mocks.supabase.mock.calls[0][0]).toContain(`company_id=eq.${companyId}&status=eq.submitted`);
    for (const [path] of mocks.supabase.mock.calls) expect(path).toContain(`company_id=eq.${companyId}`);
  });

  it("filters by any of the five statuses or all, and rejects unknown statuses", async () => {
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    await GET(new NextRequest("http://localhost/api/orders?status=delivered"));
    expect(mocks.supabase.mock.calls[0][0]).toContain("&status=eq.delivered");
    mocks.supabase.mockClear();
    await GET(new NextRequest("http://localhost/api/orders?status=all"));
    expect(mocks.supabase.mock.calls[0][0]).not.toContain("status=eq.");
    mocks.supabase.mockClear();
    expect((await GET(new NextRequest("http://localhost/api/orders?status=paid"))).status).toBe(400);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("searches by store name inside the company and skips the order query when nothing matches", async () => {
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    await GET(new NextRequest(`http://localhost/api/orders?q=${encodeURIComponent("송파")}`));
    expect(mocks.supabase.mock.calls[0][0]).toContain(`normalized_customers?company_id=eq.${companyId}&customer_name=ilike.*`);
    expect(mocks.supabase.mock.calls[1][0]).toContain("customer_id=in.(c1)");
    mocks.supabase.mockReset().mockResolvedValueOnce([]);
    const empty = await GET(new NextRequest(`http://localhost/api/orders?q=${encodeURIComponent("없는매장")}`));
    expect((await empty.json()).items).toEqual([]);
    expect(mocks.supabase).toHaveBeenCalledTimes(1);
    expect((await GET(new NextRequest("http://localhost/api/orders?q=a*b"))).status).toBe(400);
  });

  it("lets sales staff view orders but not confirm them", async () => {
    mocks.manage.mockReturnValue(false);
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "member", workspaceRole: "sales" } });
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    expect((await GET(new NextRequest("http://localhost/api/orders"))).status).toBe(200);
    mocks.supabase.mockClear();
    expect((await confirm()).status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("hides the feature when store ordering is off for the company", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await GET(new NextRequest("http://localhost/api/orders"))).status).toBe(404);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("blocks staff without order permission", async () => {
    mocks.manage.mockReturnValue(false);
    expect((await confirm()).status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("does not let a MAJU admin preview confirm a customer's order", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: null, adminSession: { id: "a" } });
    expect((await confirm()).status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("confirms only a still-new order at the revision the staff saw", async () => {
    mocks.supabase.mockResolvedValueOnce([{ id: orderId, status: "received", revision: 3 }]);
    expect((await confirm()).status).toBe(200);
    const [path, init] = mocks.supabase.mock.calls[0];
    expect(path).toContain(`company_id=eq.${companyId}&id=eq.${orderId}&status=eq.submitted&revision=eq.2`);
    expect(JSON.parse(init.body)).toMatchObject({ status: "received", revision: 3 });
  });

  it("reports a conflict when the owner edited or someone already confirmed", async () => {
    mocks.supabase.mockResolvedValueOnce([]);
    expect((await confirm()).status).toBe(409);
  });

  it("rejects a malformed order id before touching the database", async () => {
    expect((await confirm({ orderId: "1,id.neq.0" })).status).toBe(400);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});

describe("store order status", () => {
  it("labels every status in Korean and only lets new orders be confirmed", () => {
    expect(storeOrderStatusLabel("received")).toBe("확인됨");
    expect(storeOrderStatusLabel("unknown")).toBe("확인 필요");
    expect(canConfirmStoreOrder("submitted")).toBe(true);
    expect(canConfirmStoreOrder("received")).toBe(false);
  });
});
