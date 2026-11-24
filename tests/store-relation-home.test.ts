import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn(), active: vi.fn(), allowed: vi.fn(), feature: vi.fn(), overview: vi.fn() }));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreMemberContext: vi.fn() }));
vi.mock("../lib/store/08-store-cost-access", () => ({ hasActiveStoreMembership: mocks.active }));
vi.mock("../lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: mocks.allowed }));
vi.mock("../lib/store/07-store-address-management", () => ({ isStoreAddressCompanyEnabled: () => false }));
vi.mock("../lib/store/07-store-settlement-account", () => ({ getStoreSettlementAccount: async () => null }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/pricing/company-links", () => ({ companyLinkOverview: mocks.overview }));
vi.mock("../lib/pricing/store-portal-source-documents", () => ({ readStorePortalSourceDocuments: async () => [] }));
import { listStorePortalAccounts } from "../lib/store/07-store-portal";
import { recordStoreActivity } from "../lib/store/07-store-activity";

const c1 = "00000000-0000-4000-8000-000000000001", c2 = "00000000-0000-4000-8000-000000000011";
const a1 = "00000000-0000-4000-8000-000000000002", a2 = "00000000-0000-4000-8000-000000000012";
const k1 = "00000000-0000-4000-8000-000000000003", k2 = "00000000-0000-4000-8000-000000000013";
const doc = "10000000-0000-4000-8000-000000000001", sentVersion = "20000000-0000-4000-8000-000000000001";
const sheet = (title: string) => ({ kind: "sheet", title, validUntil: "2099-01-01", showPrice: true, lines: [{ visible: true }, { visible: true }] });

let confirmed: boolean | Record<string, boolean>, existingCatalog: Record<string, { id: string; token_nonce: string; token_hash: string }>;
let members: Array<{ company_id: string; store_account_id: string; customer: string }>;
const rpcCalls = () => mocks.db.mock.calls.filter(call => String(call[0]).startsWith("rpc/"));

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STORE_LINK_SECRET", "synthetic-store-link-secret-over-32-characters");
  confirmed = true; existingCatalog = {}; members = [{ company_id: c1, store_account_id: a1, customer: k1 }];
  mocks.session.mockResolvedValue({ authUserId: "verified-user" });
  mocks.active.mockResolvedValue(true); mocks.allowed.mockReturnValue(true);
  mocks.feature.mockImplementation((feature: string) => feature !== "COMPANY_LINK_UNIFY");
  mocks.overview.mockResolvedValue({ links: [{ isDefault: true, documentId: doc, expiresAt: "2099-01-01T00:00:00Z", viewerPath: "/pricing-document#default-token" }] });
  mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.startsWith("store_account_members?")) return members.map(m => ({ company_id: m.company_id, store_account_id: m.store_account_id, role: "owner", store_accounts: { customer_id: m.customer } }));
    if (path.startsWith("normalized_customers?")) return [{ customer_name: "합성 매장" }];
    if (path.startsWith("companies?")) return [{ business_type: "외식업", name: "합성 유통" }];
    if (path.startsWith("storefront_links?") && path.includes("source=eq.catalog")) {
      const customer = /customer_id=eq\.([^&]+)/.exec(path)![1];
      return existingCatalog[customer] ? [existingCatalog[customer]] : [];
    }
    if (path.startsWith("storefront_links?")) return [];
    if (path.startsWith("rpc/store_price_visible_v1")) return typeof confirmed === "boolean" ? confirmed : confirmed[body.p_store_account] === true;
    if (path.startsWith("rpc/issue_catalog_storefront_links_v1") || path.startsWith("rpc/issue_storefront_links")) {
      const link = body.p_links[0];
      return [{ issued_link_id: link.id, issued_token_nonce: link.nonce, issued_token_hash: link.hash, issued_customer_id: link.customerId, was_created: true }];
    }
    if (path.startsWith("pricing_document_sends?")) return [{ document_version_id: sentVersion }];
    if (path.startsWith("pricing_document_versions?") && path.includes(`id=in.(${sentVersion})`)) return [{ id: sentVersion, document_id: doc, content: sheet("받은 단가표") }];
    if (path.startsWith("pricing_document_versions?")) return [{ id: sentVersion, document_id: doc, content: sheet("기본 단가표") }];
    if (path.startsWith("rpc/store_member_catalog_v2")) return [{ product_name: "합성 양파", sales_spec: "10 kg", sales_unit: "박스", large_category: "채소", price: null, purchase_price: 7777, cost: 7777 }];
    return [];
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("CX-141 relation home", () => {
  it("a confirmed store with zero links gets its catalog link, received documents and an orderable entry from login alone", async () => {
    const [account] = (await listStorePortalAccounts())!;
    const issued = rpcCalls().filter(call => String(call[0]).startsWith("rpc/issue_catalog_storefront_links_v1"));
    expect(issued).toHaveLength(1);
    expect(JSON.parse(String(issued[0][1]!.body))).toMatchObject({ p_company: c1, p_links: [{ customerId: k1 }], p_actor_user_id: null });
    expect(account.catalogHref).toMatch(/^\/store\?view=order#/);
    expect(account.relation).toEqual({ confirmed: true });
    expect(account.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "받은 단가표", href: expect.stringMatching(/^\/store#/), canOrder: true }),
      expect.objectContaining({ title: "기본 단가표", href: "/pricing-document#default-token", canOrder: false })]));
    expect(rpcCalls().some(call => String(call[0]).startsWith("rpc/store_member_catalog_v2"))).toBe(false);
  });

  it("reuses an existing catalog link instead of issuing a second one", async () => {
    const id = "30000000-0000-4000-8000-000000000001", token = issueStoreLinkToken(id);
    existingCatalog[k1] = { id, token_nonce: token.nonce, token_hash: token.hash };
    const [account] = (await listStorePortalAccounts())!;
    expect(rpcCalls().some(call => String(call[0]).startsWith("rpc/issue_catalog_storefront_links_v1"))).toBe(false);
    expect(account.catalogHref).toBe(`/store?view=order#${token.token}`);
  });

  it("an unconfirmed store sees products without prices and cannot order: no link, no order documents, no cost fields", async () => {
    confirmed = false;
    const accounts = (await listStorePortalAccounts())!;
    const [account] = accounts;
    expect(account.catalogHref).toBeUndefined();
    expect(account.relation).toEqual({ confirmed: false, products: [{ name: "합성 양파", spec: "10 kg", unit: "박스", category: "채소" }] });
    expect(account.documents.every(document => !document.canOrder)).toBe(true);
    expect(rpcCalls().some(call => /issue_catalog_storefront_links_v1|issue_storefront_links/.test(String(call[0])))).toBe(false);
    expect(JSON.stringify(accounts)).not.toMatch(/7777|purchase|cost|원가|매입/);
  });

  it("keeps each customer's account separate: other company's tokens and documents never mix", async () => {
    members = [{ company_id: c1, store_account_id: a1, customer: k1 }, { company_id: c2, store_account_id: a2, customer: k2 }];
    confirmed = { [a1]: true, [a2]: true };
    const accounts = (await listStorePortalAccounts())!;
    const issued = rpcCalls().filter(call => String(call[0]).startsWith("rpc/issue_catalog_storefront_links_v1")).map(call => JSON.parse(String(call[1]!.body)));
    expect(issued.map(item => [item.p_company, item.p_links[0].customerId]).sort()).toEqual([[c1, k1], [c2, k2]].sort());
    expect(new Set(accounts.map(account => account.catalogHref)).size).toBe(2);
    const sends = mocks.db.mock.calls.map(call => String(call[0])).filter(path => path.startsWith("pricing_document_sends?"));
    expect(sends.some(path => path.includes(`company_id=eq.${c1}`) && path.includes(`customer_id=eq.${k1}`))).toBe(true);
    expect(sends.some(path => path.includes(`company_id=eq.${c1}`) && path.includes(`customer_id=eq.${k2}`))).toBe(false);
  });

  it("with the flag OFF nothing new is called and the home equals today's", async () => {
    mocks.feature.mockImplementation((feature: string) => feature !== "COMPANY_LINK_UNIFY" && feature !== "STORE_RELATION_HOME");
    const [account] = (await listStorePortalAccounts())!;
    expect(rpcCalls()).toHaveLength(0);
    expect(account.relation).toBeUndefined(); expect(account.catalogHref).toBeUndefined();
    mocks.db.mockClear(); await recordStoreActivity(c1, a1, "home");
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("a failing relation step leaves the existing home available", async () => {
    mocks.db.mockImplementation(async (path: string) => {
      if (path.startsWith("store_account_members?")) return [{ company_id: c1, store_account_id: a1, role: "owner", store_accounts: { customer_id: k1 } }];
      if (path.startsWith("rpc/store_price_visible_v1")) throw new Error("synthetic outage");
      return path.startsWith("normalized_customers?") ? [{ customer_name: "합성 매장" }] : [];
    });
    const [account] = (await listStorePortalAccounts())!;
    expect(account.customerName).toBe("합성 매장"); expect(account.relation).toBeUndefined();
  });

  it("records only kind and reference id (never search text) and swallows failures", async () => {
    await recordStoreActivity(c1, a1, "search");
    expect(mocks.db).toHaveBeenCalledWith("rpc/record_store_activity_v1", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(mocks.db.mock.calls[0][1].body))).toEqual({ p_company: c1, p_account: a1, p_kind: "search", p_ref: null });
    mocks.db.mockRejectedValueOnce(new Error("down"));
    await expect(recordStoreActivity(c1, a1, "home")).resolves.toBeUndefined();
  });
});
