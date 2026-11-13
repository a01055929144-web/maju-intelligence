import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allowlisted: vi.fn(), context: vi.fn(), create: vi.fn(), enabled: vi.fn(),
  list: vi.fn(), origin: vi.fn(), prepared: vi.fn(), proof: vi.fn(), remove: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ setStoreMemberInvitationProof: mocks.proof, storeMemberSessionEnabled: mocks.enabled }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowlisted }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/store/07-store-member-management", () => ({
  createStoreMemberInvitation: mocks.create, getPreparedStoreMemberInvitation: mocks.prepared,
  listStoreMembers: mocks.list, removeStoreMember: mocks.remove
}));
vi.mock("@/lib/store/07-store-owner-provisioning", () => ({ getStorePublicBaseUrl: mocks.origin }));

import { POST as acceptInvitation } from "../app/api/store/members/accept/route";
import { DELETE as removeMember, GET as listMembers, POST as createInvitation } from "../app/api/store/members/route";

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

  it.each([
    ["owner", "manager", 200], ["owner", "staff", 200], ["manager", "manager", 403],
    ["manager", "staff", 200], ["staff", "staff", 403]
  ] as const)("allows %s to invite %s only when permitted", async (actorRole, invitedRole, status) => {
    mocks.context.mockResolvedValue({ companyId, memberId: "actor", role: actorRole, storeAccountId });
    mocks.origin.mockReturnValue("https://store.test");
    mocks.create.mockResolvedValue("a".repeat(43));
    const response = await createInvitation(request("/api/store/members", { companyId, role: invitedRole, storeAccountId }));
    expect(response.status).toBe(status);
    expect(mocks.create).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it("uses the verified actor scope for removal and blocks staff", async () => {
    const targetMemberId = "00000000-0000-4000-8000-000000000003";
    mocks.context.mockResolvedValue({ companyId, memberId: "verified-actor", role: "manager", storeAccountId });
    const response = await removeMember(request("/api/store/members", {
      actorMemberId: "forged-actor", companyId, storeAccountId, targetMemberId
    }));
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ actorMemberId: "verified-actor", companyId, storeAccountId, targetMemberId });

    vi.clearAllMocks();
    mocks.allowlisted.mockReturnValue(true);
    mocks.context.mockResolvedValue({ companyId, memberId: "staff", role: "staff", storeAccountId });
    expect((await removeMember(request("/api/store/members", { companyId, storeAccountId, targetMemberId }))).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("lists members only after verifying an owner or manager session", async () => {
    mocks.context.mockResolvedValue({ companyId, memberId: "actor", role: "manager", storeAccountId });
    mocks.list.mockResolvedValue([{ id: "staff", name: "매장 직원", role: "staff", status: "active" }]);
    const response = await listMembers(new NextRequest(`https://test/api/store/members?companyId=${companyId}&storeAccountId=${storeAccountId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ actorMemberId: "actor", actorRole: "manager",
      members: [{ id: "staff", role: "staff" }] });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ companyId, storeAccountId });
  });

  it("does not read the roster for a staff member or a company outside the rollout", async () => {
    mocks.context.mockResolvedValue({ companyId, memberId: "actor", role: "staff", storeAccountId });
    const url = `https://test/api/store/members?companyId=${companyId}&storeAccountId=${storeAccountId}`;
    expect((await listMembers(new NextRequest(url))).status).toBe(403);
    mocks.allowlisted.mockReturnValue(false);
    expect((await listMembers(new NextRequest(url))).status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
