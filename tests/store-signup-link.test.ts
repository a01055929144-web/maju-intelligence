import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const mocks = vi.hoisted(() => ({ db: vi.fn(), feature: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
import { finalizeStoreSignup, findSignupLeadId, readInviteStatus, recordInviteOpen } from "../lib/store/07-store-signup-link";

const c1 = "00000000-0000-4000-8000-000000000001", a1 = "10000000-0000-4000-8000-000000000001", k1 = "20000000-0000-4000-8000-000000000001";
const lead = "30000000-0000-4000-8000-000000000001", lead2 = "30000000-0000-4000-8000-000000000002", share = "40000000-0000-4000-8000-000000000001";
const token = "A".repeat(43), hash = createHash("sha256").update(token).digest("hex");
const customer = { customer_name: "홍곱창 신촌점", address: "서울 서대문구 신촌로 1", phone: "02-111-2222", business_registration_number: "123-45-67890" };
let leads: Array<Record<string, unknown>>, shareLead: string | null, rpcBody: Record<string, unknown> | null;
const rpcs = () => mocks.db.mock.calls.filter(call => String(call[0]).startsWith("rpc/"));

beforeEach(() => {
  vi.clearAllMocks(); mocks.feature.mockReturnValue(true); leads = []; shareLead = null; rpcBody = null;
  mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("store_accounts?")) return [{ customer_id: k1 }];
    if (path.startsWith("store_owner_activation_requests?") && path.includes("select=share_link_id")) return [{ share_link_id: share }];
    if (path.startsWith("store_owner_activation_requests?") && path.includes(`invite_token_hash=eq.${hash}`)) return [{ company_id: c1 }];
    if (path.startsWith("pricing_document_share_links?")) return [{ lead_id: shareLead }];
    if (path.startsWith("normalized_customers?")) return [customer];
    if (path.startsWith("business_permit_leads?")) return leads;
    if (path.startsWith("rpc/finalize_store_signup_v1")) { rpcBody = JSON.parse(String(init?.body)); return { autoConfirmed: true }; }
    if (path.startsWith("rpc/record_store_invite_open_v1")) return true;
    return [];
  });
});

describe("CX-142 store signup link", () => {
  it("with the flag off nothing is called and signup is unaffected", async () => {
    mocks.feature.mockReturnValue(false);
    await finalizeStoreSignup({ companyId: c1, storeAccountId: a1, route: "invite", token });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(await recordInviteOpen(null, token)).toBe(false);
    expect(await readInviteStatus(c1, k1)).toBeNull();
  });
  it("a lead-specific share link connects exactly that lead", async () => {
    shareLead = lead;
    await finalizeStoreSignup({ companyId: c1, storeAccountId: a1, route: "company_link", token });
    expect(rpcBody).toEqual({ p_company: c1, p_store_account: a1, p_route: "company_link", p_lead: lead });
    expect(mocks.db.mock.calls.some(call => String(call[0]).startsWith("business_permit_leads?"))).toBe(false);
  });
  it("otherwise reuses the customer-registration lead rule: business number first", async () => {
    leads = [{ id: lead, business_name: "다른 상호", address: null, phone: null, business_number: "1234567890", matched_customer_id: null, status: "신규" }];
    await finalizeStoreSignup({ companyId: c1, storeAccountId: a1, route: "invite", token });
    expect(rpcBody).toMatchObject({ p_route: "invite", p_lead: lead });
    expect(mocks.db.mock.calls.some(call => String(call[0]).includes("business_number=eq.1234567890") && String(call[0]).includes(`company_id=eq.${c1}`))).toBe(true);
  });
  it("name + phone is the helper rule; a phone-only lead with another name is not connected", async () => {
    mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("store_accounts?")) return [{ customer_id: k1 }];
      if (path.startsWith("normalized_customers?")) return [{ ...customer, business_registration_number: null }];
      if (path.startsWith("business_permit_leads?")) return [
        { id: lead, business_name: "홍곱창 신촌점", address: null, phone: "021112222", business_number: null, matched_customer_id: null, status: "신규" },
        { id: lead2, business_name: "공용번호 다른 가게", address: null, phone: "021112222", business_number: null, matched_customer_id: null, status: "신규" }];
      if (path.startsWith("rpc/finalize_store_signup_v1")) { rpcBody = JSON.parse(String(init?.body)); return {}; }
      return [];
    });
    expect(await findSignupLeadId({ companyId: c1, customerId: k1 })).toBe(lead);
  });
  it("ambiguous candidates are not guessed", async () => {
    leads = [{ id: lead, business_name: "x", address: null, phone: null, business_number: "1234567890", matched_customer_id: null, status: "신규" },
      { id: lead2, business_name: "y", address: null, phone: null, business_number: "1234567890", matched_customer_id: null, status: "신규" }];
    expect(await findSignupLeadId({ companyId: c1, customerId: k1 })).toBeNull();
  });
  it("a failure never breaks signup, and the RPC is still the single idempotent writer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.db.mockRejectedValue(new Error("outage"));
    await expect(finalizeStoreSignup({ companyId: c1, storeAccountId: a1, route: "invite", token })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("store_signup_finalize_failed", { route: "invite" });
    log.mockRestore();
  });
  it("records an invite open only for a valid 43-char token of an enabled company", async () => {
    expect(await recordInviteOpen(null, token)).toBe(true);
    expect(rpcs().map(call => JSON.parse(String(call[1]!.body)))).toEqual([{ p_invite_token_hash: hash }]);
    expect(await recordInviteOpen(null, "short")).toBe(false);
    expect(await recordInviteOpen("00000000-0000-4000-8000-0000000000ff", token)).toBe(false);
  });
});
