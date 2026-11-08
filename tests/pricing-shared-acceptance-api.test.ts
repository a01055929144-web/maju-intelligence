import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authScope, getStoreSession, memberContext, requests } = vi.hoisted(() => ({
  authScope: vi.fn(),
  getStoreSession: vi.fn(),
  memberContext: vi.fn(),
  requests: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({
  getRequestAuthScope: authScope,
  getStoreSession,
  scopeHasCapability: (scope: { canManage?: boolean }) => scope.canManage === true,
}));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: memberContext }));
vi.mock("../lib/store", () => ({ supabaseRequest: requests }));

import { POST } from "../app/api/pricing-document-acceptance/route";
import { issueDocumentShareToken } from "../lib/pricing/document-share-token";

const company = "00000000-0000-4000-8000-000000000001";
const document = "10000000-0000-4000-8000-000000000001";
const version = "20000000-0000-4000-8000-000000000001";
const lead = "30000000-0000-4000-8000-000000000001";
const send = "40000000-0000-4000-8000-000000000001";
const share = "50000000-0000-4000-8000-000000000001";
const idempotencyKey = "60000000-0000-4000-8000-000000000001";

function request(token: string, customerProfile: Record<string, unknown> = {}) {
  return new NextRequest("https://test/api/pricing-document-acceptance", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://test" },
    body: JSON.stringify({ shareToken: token, idempotencyKey, customerProfile }),
  });
}

describe("shared pricing acceptance API contract", () => {
  let token: ReturnType<typeof issueDocumentShareToken>;
  let rpcBodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET", "lead-document-test-secret-at-least-32-characters");
    vi.stubEnv("STORE_LINK_SECRET", "store-link-test-secret-at-least-32-characters");
    vi.stubEnv("STORE_PUBLIC_BASE_URL", "https://store.example.test");
    vi.stubEnv("PRICE_SHEETS_ENABLED", "true");
    vi.stubEnv("STORE_ORDERING_ENABLED", "true");
    vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company);
    vi.stubEnv("FEATURE_STORE_ORDERING_COMPANY_IDS", company);
    vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "true");
    vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", company);
    vi.stubEnv("QUOTE_ACCEPTANCE", "true");
    vi.stubEnv("QUOTE_ACCEPTANCE_COMPANY_IDS", company);
    token = issueDocumentShareToken(share);
    rpcBodies = [];
    authScope.mockResolvedValue({ ok: false, role: "anonymous" });
    getStoreSession.mockResolvedValue(null);
    memberContext.mockReset();
    requests.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("pricing_document_share_links?")) return [{
        id: share, company_id: company, document_id: document, document_version_id: version,
        lead_id: lead, send_id: send, token_nonce: token.nonce, token_hash: token.hash,
        expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null,
      }];
      if (path.startsWith("pricing_document_sends?")) return [{ id: send }];
      if (path.startsWith("pricing_document_versions?")) return [{ id: version }];
      if (path.startsWith("pricing_documents?")) return [{ id: document }];
      if (path.startsWith("business_permit_leads?")) return [{ matched_customer_id: null }];
      if (path === "rpc/pricing_s2_public_request_guard") return "allowed";
      if (path === "rpc/accept_pricing_document_and_issue_storefront_link") {
        const body = JSON.parse(String(init?.body));
        rpcBodies.push(body);
        return { documentVersionId: version, kind: "sheet", needsReview: true, orderEnabled: false };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("stays dark before any data read when QUOTE_ACCEPTANCE is off", async () => {
    vi.stubEnv("QUOTE_ACCEPTANCE", "false");
    const response = await POST(request(token.token));
    expect(response.status).toBe(404);
    expect(requests).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before any data read", async () => {
    const crossOrigin = new NextRequest("https://test/api/pricing-document-acceptance", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.test" },
      body: JSON.stringify({ shareToken: token.token, idempotencyKey }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(requests).not.toHaveBeenCalled();
  });

  it("derives company, document, version, send, lead and actor from the verified share", async () => {
    const response = await POST(request(token.token, { businessName: "  합성 매장  ", companyId: "forged" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ needsReview: true, orderEnabled: false });
    expect(rpcBodies).toHaveLength(1);
    expect(rpcBodies[0]).toMatchObject({
      p_accepted_via: "store",
      p_actor_key: null,
      p_company_id: company,
      p_document_id: document,
      p_document_version_id: version,
      p_idempotency_key: idempotencyKey,
      p_lead_id: lead,
      p_send_id: send,
      p_customer_profile: { businessName: "합성 매장" },
    });
    expect(JSON.stringify(rpcBodies[0])).not.toContain("forged");
  });

  it("uses the existing 07 store session/member boundary and returns order setup state", async () => {
    const customer = "70000000-0000-4000-8000-000000000001";
    const authUser = "80000000-0000-4000-8000-000000000001";
    getStoreSession.mockResolvedValue({ authUserId: authUser });
    memberContext.mockResolvedValue({ authUserId: authUser, memberId: "90000000-0000-4000-8000-000000000001" });
    requests.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("pricing_document_share_links?")) return [{ id: share, company_id: company,
        document_id: document, document_version_id: version, lead_id: lead, send_id: send,
        token_nonce: token.nonce, token_hash: token.hash, expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null }];
      if (path.startsWith("pricing_document_sends?")) return [{ id: send }];
      if (path.startsWith("pricing_document_versions?")) return [{ id: version }];
      if (path.startsWith("pricing_documents?")) return [{ id: document }];
      if (path.startsWith("business_permit_leads?")) return [{ matched_customer_id: customer }];
      if (path.startsWith("normalized_customers?")) return [{ customer_name: "서버 매장", phone: "0101", address: "서울", business_number: "123" }];
      if (path === "rpc/pricing_s2_public_request_guard") return "allowed";
      if (path === "rpc/accept_pricing_document_and_issue_storefront_link") {
        const body = JSON.parse(String(init?.body)); rpcBodies.push(body);
        return { customerId: customer, documentVersionId: version, kind: "quote", needsReview: false,
          orderEnabled: false, orderSetupRequired: true };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const response = await POST(request(token.token, { businessName: "클라이언트 위조" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ orderEnabled: false, orderSetupRequired: true });
    expect(memberContext).toHaveBeenCalledWith({ companyId: company, customerId: customer });
    expect(rpcBodies[0]).toMatchObject({
      p_accepted_via: "kakao_login",
      p_actor_key: "store-member:90000000-0000-4000-8000-000000000001",
      p_actor_user_id: authUser,
      p_customer_id: customer,
      p_customer_profile: { businessName: "서버 매장", phone: "0101", address: "서울", businessRegistrationNumber: "123" },
    });
  });

  it("denies a staff session without the existing manage_sales capability", async () => {
    authScope.mockResolvedValue({ ok: true, companyId: company, canManage: false, customerSession: { userId: "user" } });
    const response = await POST(request(token.token));
    expect(response.status).toBe(404);
    expect(requests.mock.calls.some(([path]) => path === "rpc/accept_pricing_document_and_issue_storefront_link")).toBe(false);
  });

  it("keeps the RPC fingerprint stable after the first acceptance links a customer", async () => {
    const customer = "70000000-0000-4000-8000-000000000001";
    let leadReads = 0;
    const base = requests.getMockImplementation()!;
    requests.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("business_permit_leads?"))
        return [{ matched_customer_id: leadReads++ ? customer : null }];
      if (path.startsWith("normalized_customers?"))
        return [{ customer_name: "재시도 매장", phone: null, address: null, business_number: null }];
      return base(path, init);
    });
    await POST(request(token.token, { businessName: "재시도 매장" }));
    await POST(request(token.token, { businessName: "재시도 매장" }));
    await POST(request(token.token, { businessName: "다른 요청" }));
    expect(rpcBodies).toHaveLength(3);
    expect(rpcBodies[0].p_request_fingerprint).toBe(rpcBodies[1].p_request_fingerprint);
    expect(rpcBodies[2].p_request_fingerprint).not.toBe(rpcBodies[1].p_request_fingerprint);
  });
});
