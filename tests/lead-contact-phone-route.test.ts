import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  capability: vi.fn(),
  updatePhones: vi.fn(),
  updateProfile: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getCustomerOperationalName: () => "합성 담당자",
  getRequestAuthScope: mocks.auth,
  scopeHasCapability: mocks.capability
}));
vi.mock("@/domains/lead/lead-action", () => ({ resolveLeadContactActorName: () => "합성 담당자" }));
vi.mock("@/lib/store", () => ({
  deletePermitLead: vi.fn(),
  updatePermitLeadContactPhones: mocks.updatePhones,
  updatePermitLeadProfile: mocks.updateProfile
}));

import { PATCH } from "../app/api/leads/permits/[id]/route";

const params = { params: Promise.resolve({ id: "lead-1" }) };
const request = (body: Record<string, unknown>) => new NextRequest("https://example.test/api/leads/permits/lead-1", {
  body: JSON.stringify(body),
  method: "PATCH"
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    companyId: "trusted-company",
    customerSession: { companyMemberId: "member-1" },
    ok: true,
    role: "customer"
  });
  mocks.capability.mockReturnValue(true);
  mocks.updatePhones.mockResolvedValue({ ok: true, ownerMobilePhone: "01012345678" });
});

describe("PATCH /api/leads/permits/[id] contact phones", () => {
  it("uses the signed company and active company member boundary", async () => {
    const response = await PATCH(request({ companyId: "forged-company", ownerMobilePhone: " 010-1234-5678 " }), params);

    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "forged-company");
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), "manage_customers");
    expect(mocks.updatePhones).toHaveBeenCalledWith(
      "trusted-company",
      "lead-1",
      "member-1",
      { ownerMobilePhone: "010-1234-5678" }
    );
  });

  it("rejects missing member identity, invalid value types, and mixed profile writes", async () => {
    mocks.auth.mockResolvedValueOnce({ companyId: "trusted-company", customerSession: {}, ok: true, role: "customer" });
    expect((await PATCH(request({ storePhone: "02-1234-5678" }), params)).status).toBe(403);
    expect((await PATCH(request({ ownerMobilePhone: 1012345678 }), params)).status).toBe(400);
    expect((await PATCH(request({ ownerMobilePhone: "010-1234-5678", fax: "02-111-2222" }), params)).status).toBe(400);
    expect(mocks.updatePhones).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps the existing manage_customers capability gate", async () => {
    mocks.capability.mockReturnValue(false);

    expect((await PATCH(request({ storePhone: "02-1234-5678" }), params)).status).toBe(403);
    expect(mocks.updatePhones).not.toHaveBeenCalled();
  });
});
