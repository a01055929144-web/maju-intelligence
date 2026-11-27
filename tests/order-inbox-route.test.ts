import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), enabled: vi.fn(() => true), manage: vi.fn(() => true), notifications: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/feature-flags", async (original) => {
  const real = await original<typeof import("../lib/feature-flags")>();
  return { isFeatureEnabled: (name: Parameters<typeof real.isFeatureEnabled>[0], companyId: string) =>
    name === "ERP_ORDER_DOCUMENTS" ? real.isFeatureEnabled(name, companyId) : mocks.enabled() };
});
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: mocks.manage }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, getCustomerOperationalName: () => "합성 담당자" }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
vi.mock("@/lib/store/07-company-notifications", () => ({ markNewOrderNotificationProcessed: mocks.notifications }));
import { GET, POST } from "../app/api/orders/route";
import { canConfirmStoreOrder, storeOrderStatusLabel } from "../domains/order/store-order-status";

const companyId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-0000000000aa";
const customer = { ok: true, companyId, customerSession: { role: "owner", workspaceRole: "owner" } };
const confirm = (body: Record<string, unknown> = {}) => POST(new NextRequest("http://localhost/api/orders", {
  method: "POST", body: JSON.stringify({ action: "confirm", orderId, revision: 2, ...body }),
}));

describe("order inbox API", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabase.mockReset();
    mocks.enabled.mockReturnValue(true);
    mocks.manage.mockReturnValue(true);
    mocks.notifications.mockResolvedValue(undefined);
    mocks.auth.mockResolvedValue(customer);
  });

  const orderRow = (member: string | null) => ({ id: orderId, customer_id: "c1", delivery_date: "2026-11-12", status: "submitted", known_total: 12000,
    taxable_supply: 10000, exempt_supply: 1000, tax_amount: 1000, has_market_price: false, request_memo: "", submitted_at: "2026-11-10T01:00:00Z",
    updated_at: "2026-11-10T01:00:00Z", revision: 1, ordered_by_member_id: member, store_account_id: "a1",
    delivery_customer_name_snapshot: "주문 당시 매장", delivery_address_snapshot: "서울 송파구 주문로 2", delivery_address_detail_snapshot: "202호",
    delivery_recipient_phone_snapshot: "010-1234-5678", delivery_loading_position_snapshot: "뒷문", store_order_lines: [{ product_name: "합성 상품", specification: "1kg", sales_unit: "봉", quantity: 2, unit_price: 5000, supply_amount: 10000, tax_amount: 1000, total_amount: 11000, is_market_price: false, promotion_id: "p1" }] });
  const routeFor = (path: string) => {
    if (path.startsWith("store_orders?") && path.includes("select=status")) return [{ status: "submitted" }, { status: "received" }];
    if (path.startsWith("store_orders?")) return [orderRow("m1")];
    if (path.startsWith("normalized_customers?") && path.includes("ilike")) return [{ id: "c1" }];
    if (path.startsWith("normalized_customers?")) return [{ id: "c1", customer_name: "송파 시험 매장", address: "옛 주소", delivery_base_address: "서울 송파구 합성로 1", delivery_address_detail: "101호" }];
    if (path.startsWith("store_account_members?")) return [{ id: "m1", role: "owner", app_users: { name: "합성 점주" } }];
    if (path.startsWith("store_accounts?")) return [{ id: "a1", customer_review_status: "confirmed", store_profiles: { access_password_updated_at: "2026-11-01T00:00:00Z" } }];
    if (path.startsWith("business_documents?")) return [];
    throw new Error(`unexpected ${path}`);
  };

  it("lists this company's recent orders from stored snapshots without recalculating amounts", async () => {
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    const response = await GET(new NextRequest("http://localhost/api/orders"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items[0]).toMatchObject({ customerName: "주문 당시 매장", status: "submitted", knownTotal: 12000,
      supplyAmount: 11000, taxAmount: 1000, deliveryAddress: "서울 송파구 주문로 2 202호", loadingPosition: "뒷문",
      recipientPhoneLast4: "5678", deliveryPasswordSet: true, orderedBy: "합성 점주 · 점주" });
    expect(result.items[0].lines[0]).toMatchObject({ unitPrice: 5000, supply: 10000, tax: 1000, total: 11000, promotion: true });
    expect(result.statusCounts).toMatchObject({ submitted: 1, received: 1 });
    expect(mocks.supabase.mock.calls[0][0]).toContain(`company_id=eq.${companyId}&submitted_at=gte.`);
    expect(mocks.supabase.mock.calls[0][0]).not.toContain("status=eq.");
    for (const [path] of mocks.supabase.mock.calls) expect(path).toContain(`company_id=eq.${companyId}`);
  });

  it("loads a 500-order window only for an explicitly enabled company", async () => {
    vi.stubEnv("ORDER_LIST_EXPORT_ENABLED", "true");
    vi.stubEnv("FEATURE_ORDER_LIST_EXPORT_COMPANY_IDS", companyId);
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    await GET(new NextRequest("http://localhost/api/orders?page=2"));
    expect(mocks.supabase.mock.calls[0][0]).toContain("limit=501&offset=500");

    vi.stubEnv("FEATURE_ORDER_LIST_EXPORT_COMPANY_IDS", "another-company");
    mocks.supabase.mockClear();
    await GET(new NextRequest("http://localhost/api/orders?page=2"));
    expect(mocks.supabase.mock.calls[0][0]).toContain("limit=21&offset=20");
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

  it("supports delivery date ranges and rejects invalid ranges", async () => {
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    await GET(new NextRequest("http://localhost/api/orders?dateField=delivery&from=2026-11-01&to=2026-11-30"));
    expect(mocks.supabase.mock.calls[0][0]).toContain("delivery_date=gte.2026-11-01&delivery_date=lte.2026-11-30");
    mocks.supabase.mockClear();
    expect((await GET(new NextRequest("http://localhost/api/orders?from=2026-12-01&to=2026-11-01"))).status).toBe(400);
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


  it("retains legacy ERP receipt when the old allowlist is set and the CX-62 switch is off", async () => {
    vi.stubEnv("ERP_ORDER_DOCUMENTS", "true");
    vi.stubEnv("ERP_ORDER_DOCUMENTS_COMPANY_IDS", companyId);
    vi.stubEnv("FEATURE_ORDER_RECEIPT_DRAFT_COMPANY_IDS", "");
    mocks.supabase.mockResolvedValueOnce([{ id: orderId, customer_id: "c1" }])
      .mockResolvedValueOnce([]);
    const response = await confirm();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "전표가 연결되지 않았습니다. 전표 연결을 다시 시도한 뒤 접수해 주세요." });
    expect(mocks.supabase.mock.calls.map(([path]) => path)).not.toContain("rpc/receive_store_order_with_sale_document");
  });

  it("shows a pending document and accepts only the atomic receipt response", async () => {
    vi.stubEnv("FEATURE_ORDER_RECEIPT_DRAFT_COMPANY_IDS", companyId);
    mocks.supabase.mockImplementation(async (path: string) => routeFor(path));
    const listed = await (await GET(new NextRequest("http://localhost/api/orders"))).json();
    expect(listed.items[0].orderDocument).toEqual({ status: "unlinked" });

    const saved = { id: orderId, status: "received", revision: 3 };
    mocks.supabase.mockClear().mockResolvedValue(saved);
    for (const action of ["confirm", "retry_order_document"]) {
      const response = await confirm({ action, actorUserId: "forged" });
      expect(await response.json()).toEqual({ order: saved });
    }
    expect(mocks.supabase.mock.calls.map(([path]) => path)).toEqual([
      "rpc/receive_store_order_with_sale_document", "rpc/receive_store_order_with_sale_document",
    ]);
    expect(JSON.parse(mocks.supabase.mock.calls[0][1].body)).toMatchObject({
      p_company_id: companyId, p_order_id: orderId, p_expected_revision: 2, p_actor_user_id: null,
    });
  });

  it.each(["order_receipt_conflict", "order_receipt_document_unlinked", "order_receipt_amount_mismatch"])("does not patch order on RPC failure %s", async error => {
    vi.stubEnv("FEATURE_ORDER_RECEIPT_DRAFT_COMPANY_IDS", companyId);
    mocks.supabase.mockRejectedValueOnce(new Error(error));
    const response = await confirm();
    expect(response.status).toBe(409);
    if (error !== "order_receipt_conflict") expect(await response.json()).toMatchObject({ code: "order_document_failed" });
    expect(mocks.supabase).toHaveBeenCalledTimes(1);
    expect(mocks.notifications).not.toHaveBeenCalled();
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
    expect(mocks.notifications).toHaveBeenCalledWith(companyId, orderId);
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
