import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ scope: vi.fn(), capability: vi.fn(), db: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.scope, scopeHasCapability: mocks.capability }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { GET, POST } from "../app/api/pricing-document-acceptance/route";

const company = "00000000-0000-4000-8000-000000000001", version = "10000000-0000-4000-8000-000000000001";
const document = "20000000-0000-4000-8000-000000000001", customer = "30000000-0000-4000-8000-000000000001";
const key = "40000000-0000-4000-8000-000000000001", actor = createHash("sha256").update(`${company}:customer:verified-user`).digest("hex");
const prior = { ...process.env };
let kind = "sheet", needsReview = false;
function request(extra: object = {}, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/pricing-document-acceptance", { method: "POST",
    headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ documentVersionId: version, customerId: customer, idempotencyKey: key, ...extra }) });
}
beforeEach(() => {
  vi.resetAllMocks(); kind = "sheet"; needsReview = false;
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.FEATURE_PRICING_COMPANY_IDS = company;
  process.env.QUOTE_ACCEPTANCE = "true";
  process.env.FEATURE_QUOTE_ACCEPTANCE_COMPANY_IDS = company;
  mocks.scope.mockResolvedValue({ ok: true, companyId: company, customerSession: { userId: "verified-user" } });
  mocks.capability.mockReturnValue(true);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("pricing_document_versions?")) return [{ id: version, document_id: document }];
    if (path.startsWith("pricing_documents?")) return [{ id: document, kind, owner_key: actor, revision: 1, content: { title: "합성 문서", lines: [{ cost: 999 }] } }];
    if (path.startsWith("normalized_customers?")) return [{ id: customer, customer_name: "합성 매장", address: "합성 주소", phone: "01012345678", business_registration_number: "1234567890" }];
    if (path === "rpc/record_pricing_document_acceptance") return { customerId: customer, documentVersionId: version, kind, needsReview, pricingDocumentLinkId: document };
    throw new Error(`Unexpected test request: ${path}`);
  });
});
afterEach(() => { process.env = { ...prior }; });

describe("S2 authenticated staff acceptance", () => {
  it("lists company-wide acceptance choices without returning prices or cost", async () => {
    const response = await GET(new NextRequest("http://localhost/api/pricing-document-acceptance"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.items[0]).toEqual({ id: document, revision: 1, content: { title: "합성 문서" } });
    expect(JSON.stringify(body)).not.toContain("cost");
    expect(JSON.stringify(body)).not.toContain("lines");
  });
  for (const value of ["sheet", "quote"]) it(`calls the applied RPC for ${value}, never accepting client prices or actor`, async () => {
    kind = value;
    const response = await POST(request({ companyId: "other", acceptedVia: "kakao_start", actorKey: "fake", price: 1 }));
    expect(response.status).toBe(200);
    const call = mocks.db.mock.calls.find(([path]) => path === "rpc/record_pricing_document_acceptance")!;
    const payload = JSON.parse(call[1].body);
    expect(payload).toMatchObject({ p_company_id: company, p_document_id: document, p_document_version_id: version, p_customer_id: customer, p_accepted_via: "staff", p_idempotency_key: key });
    expect(payload.p_customer_profile).toEqual({ businessName: "합성 매장", address: "합성 주소", phone: "01012345678", businessRegistrationNumber: "1234567890" });
    expect(payload.price).toBeUndefined();
    expect(mocks.db.mock.calls.every(([path]) => path.startsWith("rpc/") || path.includes(`company_id=eq.${company}`))).toBe(true);
  });
  it("returns the same RPC payload and result for a retry", async () => {
    const first = await (await POST(request())).json(), second = await (await POST(request())).json();
    expect(second).toEqual(first);
    const writes = mocks.db.mock.calls.filter(([path]) => path.startsWith("rpc/"));
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual(writes[1][1]);
  });
  it("does not issue or enable an order link for ambiguous matching", async () => {
    needsReview = true;
    const body = await (await POST(request())).json();
    expect(body.result).toMatchObject({ needsReview: true, orderEnabled: false });
    expect(body.message).toContain("연결 확인");
    expect(mocks.db.mock.calls.some(([path]) => /storefront|issue_/.test(path))).toBe(false);
  });
  it("returns 404 before private reads when the master switch is off", async () => {
    process.env.QUOTE_ACCEPTANCE = "false";
    expect((await POST(request())).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects another company even with a global FEATURE switch", async () => {
    process.env.FEATURE_QUOTE_ACCEPTANCE_COMPANY_IDS = "other-company";
    process.env.FEATURE_QUOTE_ACCEPTANCE = "true";
    expect((await POST(request())).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects missing login, permission and cross-origin requests", async () => {
    mocks.scope.mockResolvedValueOnce({ ok: false });
    expect((await POST(request())).status).toBe(401);
    mocks.capability.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    mocks.capability.mockReturnValue(true);
    expect((await POST(request({}, "https://other.test"))).status).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and oversized bodies before private reads", async () => {
    expect((await POST(request({ customerId: "bad" }))).status).toBe(400);
    expect((await POST(request({ large: "a".repeat(5000) }))).status).toBe(413);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects unavailable versions and missing company-scoped documents", async () => {
    mocks.db.mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(404);
    mocks.db.mockResolvedValueOnce([{ id: version, document_id: document }]).mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.db.mock.calls.some(([path]) => path.startsWith("rpc/"))).toBe(false);
  });
  it("allows a manage_sales actor to proxy-accept another employee's quote", async () => {
    kind = "quote";
    mocks.scope.mockResolvedValue({ ok: true, companyId: company, customerSession: { userId: "another-authorized-manager" } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.db.mock.calls.some(([path]) => path === "rpc/record_pricing_document_acceptance")).toBe(true);
  });
  it("passes null customer and a scoped lead/profile to the conversion RPC", async () => {
    const lead = "50000000-0000-4000-8000-000000000001";
    const implementation = mocks.db.getMockImplementation()!;
    mocks.db.mockImplementation(async (path: string) => path.startsWith("business_permit_leads?") ? [{ id: lead }] : implementation(path));
    const response = await POST(request({ customerId: null, leadId: lead,
      customerProfile: { businessName: "신규 합성 매장", phone: "010-1234-5678", address: "합성 주소" } }));
    expect(response.status).toBe(200);
    const call = mocks.db.mock.calls.find(([path]) => path.startsWith("rpc/"))!;
    expect(JSON.parse(call[1].body)).toMatchObject({ p_customer_id: null, p_lead_id: lead,
      p_customer_profile: { businessName: "신규 합성 매장", phone: "010-1234-5678", address: "합성 주소" } });
    expect(mocks.db.mock.calls.some(([path]) => path.startsWith("normalized_customers?"))).toBe(false);
  });
  it("requires a valid profile when no existing customer is selected", async () => {
    expect((await POST(request({ customerId: null }))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects a merged or foreign lead before the RPC", async () => {
    const lead = "50000000-0000-4000-8000-000000000001";
    const implementation = mocks.db.getMockImplementation()!;
    mocks.db.mockImplementation(async (path: string) => path.startsWith("business_permit_leads?") ? [] : implementation(path));
    expect((await POST(request({ leadId: lead }))).status).toBe(404);
    const read = mocks.db.mock.calls.find(([path]) => path.startsWith("business_permit_leads?"))!;
    expect(read[0]).toContain("merged_into_lead_id=is.null");
    expect(mocks.db.mock.calls.some(([path]) => path.startsWith("rpc/"))).toBe(false);
  });
  it("maps idempotency conflicts without leaking database errors", async () => {
    const implementation = mocks.db.getMockImplementation()!;
    mocks.db.mockImplementation(async (path: string) => { if (path.startsWith("rpc/")) throw new Error("idempotency_conflict confidential"); return implementation(path); });
    const response = await POST(request()); expect(response.status).toBe(409);
    expect((await response.json()).message).not.toContain("confidential");
  });
});
