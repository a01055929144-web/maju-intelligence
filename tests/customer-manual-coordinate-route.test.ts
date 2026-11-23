import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignment: vi.fn(),
  auth: vi.fn(),
  capability: vi.fn(),
  enabled: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getCustomerAssignmentKeys: () => ({ staffMemberId: "member-1" }),
  getCustomerOperationalName: () => "테스트 담당자",
  getRequestAuthScope: mocks.auth,
  scopeHasCapability: mocks.capability
}));
vi.mock("@/lib/feature-modules", () => ({ areManualCustomerCoordinatesEnabled: mocks.enabled }));
vi.mock("@/lib/store", () => ({ canAccessAssignedCustomer: mocks.assignment, supabaseRequest: mocks.rpc }));

import { POST } from "../app/api/customers/manual-coordinate/route";

const companyId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

describe("customer manual coordinate server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ adminSession: null, companyId, customerSession: { userId: "33333333-3333-4333-8333-333333333333" }, ok: true, role: "customer" });
    mocks.capability.mockReturnValue(true);
    mocks.enabled.mockReturnValue(true);
    mocks.assignment.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ alreadyApplied: false, customerId, geocodeAccuracy: "manual", lat: 37.5, lng: 127 });
  });

  it("stops before parsing or database access while the company feature is off", async () => {
    mocks.enabled.mockReturnValue(false);
    const request = { json: vi.fn(() => { throw new Error("must not parse"); }) } as unknown as NextRequest;
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires the customer role capability and assigned-customer access", async () => {
    mocks.capability.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    mocks.capability.mockReturnValue(true);
    mocks.assignment.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid coordinates", async () => {
    expect((await POST(request({ lat: 40 }))).status).toBe(400);
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(NextRequest));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps only the authenticated company, actor, customer and manual point to one RPC", async () => {
    const response = await POST(request({ companyId: "forged-company" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("rpc/set_customer_manual_coordinate_atomic", expect.objectContaining({ method: "POST" }));
    const payload = JSON.parse(String(mocks.rpc.mock.calls[0][1].body));
    expect(payload).toEqual({
      p_actor_name: "테스트 담당자",
      p_actor_user_id: "33333333-3333-4333-8333-333333333333",
      p_company_id: companyId,
      p_customer_id: customerId,
      p_latitude: 37.5,
      p_longitude: 127,
      p_request_key: "manual-coordinate:test-1"
    });
  });
});

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest("https://example.test/api/customers/manual-coordinate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, lat: 37.5, lng: 127, requestId: "manual-coordinate:test-1", ...overrides })
  });
}
