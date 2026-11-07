import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allowlisted: vi.fn(), context: vi.fn(), create: vi.fn(), enabled: vi.fn(),
  origin: vi.fn(), prepared: vi.fn(), proof: vi.fn(), remove: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ setStoreMemberInvitationProof: mocks.proof, storeMemberSessionEnabled: mocks.enabled }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowlisted }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/store/07-store-member-management", () => ({
  createStoreMemberInvitation: mocks.create, getPreparedStoreMemberInvitation: mocks.prepared, removeStoreMember: mocks.remove
}));
vi.mock("@/lib/store/07-store-owner-provisioning", () => ({ getStorePublicBaseUrl: mocks.origin }));

import { POST as acceptInvitation } from "../app/api/store/members/accept/route";
import { POST as createInvitation } from "../app/api/store/members/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const request = (path: string, body: unknown) => new NextRequest(`https://test${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", origin: "https://test" }, body: JSON.stringify(body)
});

describe("store member route feature boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.allowlisted.mockReturnValue(true);
  });

  it("returns 404 without reading the invitation while store sessions are off", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await acceptInvitation(request("/api/store/members/accept", { token: "a".repeat(43) }));
    expect(response.status).toBe(404);
    expect(mocks.prepared).not.toHaveBeenCalled();
    expect(mocks.proof).not.toHaveBeenCalled();
  });

  it("returns 503 without creating an invitation when the public base URL is missing", async () => {
    mocks.context.mockResolvedValue({ companyId, memberId: "member", role: "owner", storeAccountId });
    mocks.origin.mockReturnValue(null);
    const response = await createInvitation(request("/api/store/members", { companyId, role: "staff", storeAccountId }));
    expect(response.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
