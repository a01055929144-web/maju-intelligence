import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn(), active: vi.fn(), allowed: vi.fn(), feature: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session, createOAuthState: async (value: string) => value,
  getCustomerSession: async () => null, getStoreMemberInvitationProof: async () => null,
  getStoreOwnerActivationProof: async () => null, storeMemberSessionEnabled: () => process.env.STORE_MEMBER_SESSION_ENABLED === "true" }));
vi.mock("@/lib/auth", () => ({ getStoreSession: mocks.session, createOAuthState: async (value: string) => value,
  getCustomerSession: async () => null, getStoreMemberInvitationProof: async () => null,
  getStoreOwnerActivationProof: async () => null, storeMemberSessionEnabled: () => process.env.STORE_MEMBER_SESSION_ENABLED === "true" }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/store/08-store-cost-access", () => ({ hasActiveStoreMembership: mocks.active }));
vi.mock("../lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowed }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowed }));
vi.mock("../lib/store/07-store-address-management", () => ({ isStoreAddressCompanyEnabled: () => true }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
import { hasAllowedStorePortalMembership, listStorePortalAccounts } from "../lib/store/07-store-portal";
import { GET as startKakao } from "../app/api/auth/kakao/start/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const customerId = "00000000-0000-4000-8000-000000000003";
const linkId = "00000000-0000-4000-8000-000000000004";
const versionId = "00000000-0000-4000-8000-000000000005";
const nonce = "a".repeat(32);

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STORE_LINK_SECRET", "synthetic-store-link-secret-over-32-characters");
  mocks.session.mockResolvedValue({ authUserId: "verified-user" });
  mocks.active.mockResolvedValue(true); mocks.allowed.mockReturnValue(true); mocks.feature.mockReturnValue(true);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("store_account_members?")) return [{ company_id: companyId, store_account_id: storeAccountId, role: "owner", store_accounts: { customer_id: customerId } }];
    if (path.startsWith("normalized_customers?")) return [{ customer_name: "합성 매장" }];
    if (path.startsWith("storefront_links?")) return [{ id: linkId, token_nonce: nonce,
      token_hash: issueStoreLinkToken(linkId, nonce).hash, document_version_id: versionId, expires_at: "2099-01-01", can_order: true }];
    if (path.startsWith("pricing_document_versions?")) return [{ id: versionId, content: { kind: "sheet", title: "합성 단가표", validUntil: "2099-01-01", showPrice: true } }];
    return [];
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("store portal", () => {
  it("requires the verified Kakao store session before querying memberships", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await listStorePortalAccounts()).toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("shows only the signed member's active company and a matching issued link", async () => {
    const accounts = await listStorePortalAccounts();
    expect(accounts).toEqual([{ companyId, storeAccountId, customerName: "합성 매장", hasCostAccess: true,
      canManageMembers: true, canManageAddress: true, documents: [{
      title: "합성 단가표", kind: "sheet", href: `/store#${issueStoreLinkToken(linkId, nonce).token}`,
      canOrder: true, validUntil: "2099-01-01" }] }]);
    expect(mocks.db.mock.calls[0][0]).toContain("auth_user_id=eq.verified-user");
    expect(mocks.db.mock.calls[1][0]).toContain(`company_id=eq.${companyId}`);
    expect(mocks.db.mock.calls[2][0]).toContain(`customer_id=eq.${customerId}`);
  });

  it("omits disabled companies and links whose saved hash does not match", async () => {
    mocks.allowed.mockReturnValue(false);
    expect(await listStorePortalAccounts()).toEqual([]);
    expect(mocks.db).toHaveBeenCalledTimes(1);
    mocks.allowed.mockReturnValue(true); mocks.db.mockImplementation(async (path: string) => {
      if (path.startsWith("store_account_members?")) return [{ company_id: companyId, store_account_id: storeAccountId, role: "staff", store_accounts: { customer_id: customerId } }];
      if (path.startsWith("normalized_customers?")) return [{ customer_name: "합성 매장" }];
      if (path.startsWith("storefront_links?")) return [{ id: linkId, token_nonce: nonce, token_hash: "0".repeat(64), document_version_id: versionId, expires_at: "2099-01-01", can_order: true }];
      if (path.startsWith("pricing_document_versions?")) return [{ id: versionId, content: { kind: "sheet", title: "합성", validUntil: "2099-01-01" } }];
      return [];
    });
    expect((await listStorePortalAccounts())?.[0]).toMatchObject({ documents: [], canManageMembers: false, canManageAddress: false });
  });

  it("does not issue a generic store session to a member of a disabled company", async () => {
    mocks.allowed.mockReturnValue(false);
    mocks.db.mockResolvedValue([{ company_id: companyId }]);
    expect(await hasAllowedStorePortalMembership("verified-user")).toBe(false);
    mocks.allowed.mockReturnValue(true);
    expect(await hasAllowedStorePortalMembership("verified-user")).toBe(true);
  });

  it("starts a standalone store Kakao login only when enabled and keeps scoped login separate", async () => {
    const url = "https://maju.example.test/api/auth/kakao/start?storePortal=1";
    expect((await startKakao(new NextRequest(url))).status).toBe(404);
    vi.stubEnv("STORE_MEMBER_SESSION_ENABLED", "true");
    vi.stubEnv("KAKAO_CLIENT_ID", "synthetic-client");
    vi.stubEnv("KAKAO_REDIRECT_URI", "https://maju.example.test/api/auth/kakao/callback");
    const response = await startKakao(new NextRequest(url));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("state")).toBe("store-portal");
    expect((await startKakao(new NextRequest(`${url}&store=1`))).status).toBe(400);
  });
});
