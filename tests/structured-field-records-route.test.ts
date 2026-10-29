import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { areStructuredFieldRecordsEnabled, canAccessAssignedCustomer, getRequestAuthScope, scopeHasCapability, supabaseRequest } = vi.hoisted(() => ({
  areStructuredFieldRecordsEnabled: vi.fn(),
  canAccessAssignedCustomer: vi.fn(),
  getRequestAuthScope: vi.fn(),
  scopeHasCapability: vi.fn(),
  supabaseRequest: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getCustomerAssignmentKeys: () => ({ staffMemberId: "member-1" }),
  getCustomerOperationalName: () => "테스트 기사",
  getRequestAuthScope,
  scopeHasCapability
}));
vi.mock("@/lib/feature-modules", () => ({ areStructuredFieldRecordsEnabled }));
vi.mock("@/lib/store", () => ({ canAccessAssignedCustomer, supabaseRequest }));

import { GET, POST } from "../app/api/customer/structured-field-records/route";

const session = { companyId: "11111111-1111-1111-1111-111111111111", userId: "22222222-2222-2222-2222-222222222222" };
const authorizedScope = { adminSession: null, companyId: session.companyId, customerSession: session, ok: true, role: "customer" };

describe("structured field record server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestAuthScope.mockResolvedValue(authorizedScope);
    areStructuredFieldRecordsEnabled.mockReturnValue(false);
    canAccessAssignedCustomer.mockResolvedValue(true);
    scopeHasCapability.mockReturnValue(true);
  });

  it("rejects unauthenticated requests before the feature flag and database", async () => {
    getRequestAuthScope.mockResolvedValue({ adminSession: null, companyId: undefined, customerSession: null, ok: false, role: "anonymous" });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(401);
    expect(areStructuredFieldRecordsEnabled).not.toHaveBeenCalled();
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("does not parse the body or call Supabase while the company flag is off", async () => {
    const request = { json: vi.fn(() => { throw new Error("body must not be read"); }) } as unknown as NextRequest;
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(request.json).not.toHaveBeenCalled();
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("maps a delivery incident to the atomic delivery RPC", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    supabaseRequest.mockResolvedValue({ eventId: "event-1", noteId: "note-1" });
    const response = await POST(jsonRequest({
      kind: "delivery",
      customerId: "33333333-3333-3333-3333-333333333333",
      memo: "파손 1박스 교환",
      idempotencyKey: "delivery:test-1",
      event: { eventType: "damage", actionCode: "exchange", status: "received" },
      items: [{ itemName: "테스트 상품", quantity: "1", quantityUnit: "박스" }]
    }));
    expect(response.status).toBe(200);
    expect(supabaseRequest).toHaveBeenCalledOnce();
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/record_delivery_event_atomic", expect.objectContaining({ method: "POST" }));
    const call = supabaseRequest.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(call.body))).toMatchObject({
      p_company_id: session.companyId,
      p_idempotency_key: "delivery:test-1",
      p_event: { eventType: "damage" }
    });
  });

  it("rejects a delivery record outside the employee assignment", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    canAccessAssignedCustomer.mockResolvedValue(false);
    const response = await POST(jsonRequest({
      kind: "delivery",
      customerId: "other-customer",
      memo: "타 담당 거래처",
      idempotencyKey: "delivery:forbidden",
      event: { eventType: "arrived" },
      items: []
    }));
    expect(response.status).toBe(403);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("maps a quote to the atomic sales offer RPC", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    supabaseRequest.mockResolvedValue({ actionId: "action-1", offerId: "offer-1" });
    const response = await POST(jsonRequest({
      kind: "lead_sales_offer",
      leadId: "44444444-4444-4444-4444-444444444444",
      memo: "사과 1박스 30000원",
      idempotencyKey: "sales:test-1",
      action: { actionType: "quote", result: "견적 전달" },
      items: [{ itemName: "사과", offeredPrice: "30000", currencyCode: "KRW" }]
    }));
    expect(response.status).toBe(200);
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/record_lead_sales_offer_atomic", expect.objectContaining({ method: "POST" }));
    const call = supabaseRequest.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(call.body))).toMatchObject({
      p_company_id: session.companyId,
      p_idempotency_key: "sales:test-1",
      p_action: { actionType: "quote" }
    });
  });

  it("rejects sales records from an employee without manage_customers", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    scopeHasCapability.mockReturnValue(false);
    const response = await POST(jsonRequest({
      kind: "lead_sales_offer",
      leadId: "lead-forbidden",
      memo: "권한 없는 견적",
      idempotencyKey: "sales:forbidden",
      action: { actionType: "quote" },
      items: [{ itemName: "사과", offeredPrice: "30000" }]
    }));
    expect(response.status).toBe(403);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("reopens the latest delivery event with its items", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    supabaseRequest
      .mockResolvedValueOnce([{ id: "event-1", event_type: "damage", cause_code: "damage" }])
      .mockResolvedValueOnce([{ id: "item-1", item_name: "테스트 상품", quantity: 1 }]);
    const response = await GET(new NextRequest("https://example.test/api/customer/structured-field-records?kind=delivery&customerId=customer-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ record: { id: "event-1", items: [{ item_name: "테스트 상품" }] } });
    expect(supabaseRequest).toHaveBeenCalledTimes(2);
  });

  it("reopens the latest sales offer with its items", async () => {
    areStructuredFieldRecordsEnabled.mockReturnValue(true);
    supabaseRequest
      .mockResolvedValueOnce([{ id: "offer-1", memo: "테스트 견적" }])
      .mockResolvedValueOnce([{ id: "item-1", item_name: "사과", offered_price: 30000 }]);
    const response = await GET(new NextRequest("https://example.test/api/customer/structured-field-records?kind=lead_sales_offer&leadId=lead-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ record: { id: "offer-1", items: [{ offered_price: 30000 }] } });
    expect(supabaseRequest).toHaveBeenCalledTimes(2);
  });
});

function jsonRequest(body: unknown) {
  return new NextRequest("https://example.test/api/customer/structured-field-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
