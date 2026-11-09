import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreOrderMemberContextForCompany: mocks.member }));
import { connectPublicDocumentOrder } from "../lib/pricing/public-document-order-connection";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";
const company = "00000000-0000-4000-8000-000000000001", store = "10000000-0000-4000-8000-000000000001";
const customer = "20000000-0000-4000-8000-000000000001", user = "30000000-0000-4000-8000-000000000001";
const context = { companyId: company, documentId: store, documentVersionId: customer, shareLinkId: user,
  tokenHash: "a".repeat(64), issuerActorKey: "b".repeat(64), expiresAt: "2099-01-01T00:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STORE_LINK_SECRET", "synthetic-order-link-secret-longer-than-32");
  mocks.member.mockResolvedValue({ authUserId: user, companyId: company, storeAccountId: store, role: "owner", status: "active", customerId: customer });
  mocks.db.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("store_account_members?")) { expect(url).toContain(`company_id=eq.${company}`); expect(url).toContain(`auth_user_id=eq.${user}`); return [{ store_account_id: store }]; }
    if (url.startsWith("store_accounts?")) return [{ customer_id: customer }];
    if (url === "rpc/issue_storefront_links") {
      const b = JSON.parse(String(init?.body));
      expect(b).toMatchObject({ p_company: company, p_document_version: context.documentVersionId, p_actor_key: context.issuerActorKey, p_actor_user_id: user, p_expires_at: context.expiresAt });
      expect(b.p_links).toHaveLength(1); expect(b.p_links[0].customerId).toBe(customer);
      const row = b.p_links[0];
      return [{ issued_customer_id: customer, issued_link_id: row.id, issued_token_nonce: row.nonce, issued_token_hash: row.hash }];
    }
    throw new Error("Unexpected request");
  });
});
afterEach(() => vi.unstubAllEnvs());
it("connects exactly the issuer version and 07-authenticated active store, with no order write", async () => {
  const result = await connectPublicDocumentOrder(context);
  expect(result).toMatchObject({ next: "order", storeUrl: expect.stringMatching(/^\/store\?products=all#/) });
  expect(mocks.member).toHaveBeenCalledWith(company);
  expect(mocks.db.mock.calls.some(([url]) => /store_orders|normalized_customers/.test(url))).toBe(false);
});
it("never queries or issues links without a 07-verified single active membership", async () => {
  mocks.member.mockResolvedValue(null);
  expect(await connectPublicDocumentOrder(context)).toBeNull(); expect(mocks.db).not.toHaveBeenCalled();
});
it.each([{ companyId: user }, { status: "removed" }, { customerId: "untrusted" }])("rejects inconsistent membership before any link write: %j", async change => {
  mocks.member.mockResolvedValue({ authUserId: user, companyId: company, customerId: customer, status: "active", ...change });
  await expect(connectPublicDocumentOrder(context)).rejects.toMatchObject({ status: 404 }); expect(mocks.db).not.toHaveBeenCalled();
});
it("fails closed on a rotated existing link signature instead of exposing a wrong link", async () => {
  const previous = mocks.db.getMockImplementation()!;
  mocks.db.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url !== "rpc/issue_storefront_links") return previous(url, init);
    const issued = issueStoreLinkToken(store);
    return [{ issued_customer_id: customer, issued_link_id: store, issued_token_nonce: issued.nonce, issued_token_hash: "0".repeat(64) }];
  });
  await expect(connectPublicDocumentOrder(context)).rejects.toThrow("signing configuration");
});
