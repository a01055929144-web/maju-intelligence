import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), prepare: vi.fn(), list: vi.fn(), revoke: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/pricing/document-share-feature", () => ({ documentSharingEnabled: () => true }));
vi.mock("../lib/pricing/document-share", () => ({ preparePublicLinkAs: mocks.prepare, listActivePublicLinks: mocks.list, revokePublicLinkById: mocks.revoke }));
import { GET, POST } from "../app/api/company-links/route";

const c1 = "00000000-0000-4000-8000-000000000001", c2 = "00000000-0000-4000-8000-000000000002";
const d1 = "10000000-0000-4000-8000-000000000001", d2 = "10000000-0000-4000-8000-000000000002", v1 = "20000000-0000-4000-8000-000000000001";
const l1 = "30000000-0000-4000-8000-000000000001";
const customer = (role = "owner") => ({ ok: true, companyId: c1, customerSession: { workspaceRole: role, email: "a@example.test" }, adminSession: null });
const post = (body: unknown) => new NextRequest("https://app.test/api/company-links", { method: "POST", headers: { origin: "https://app.test", host: "app.test", "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (qs = "") => new NextRequest(`https://app.test/api/company-links${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_COMPANY_LINK_UNIFY_COMPANY_IDS", c1);
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true"); vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", `${c1},${c2}`);
  mocks.auth.mockResolvedValue(customer());
  mocks.list.mockResolvedValue([{ id: l1, documentId: d1, createdAt: "2026-11-01T00:00:00Z", publicUrl: "/s/abc", expiresAt: "2027-01-01T00:00:00Z", viewCount: 7, firstViewedAt: null, lastViewedAt: "2026-11-20T00:00:00Z" }]);
  mocks.prepare.mockResolvedValue({ shareLinkId: l1, publicUrl: "/s/abc", expiresAt: "2027-01-01T00:00:00Z" });
  mocks.revoke.mockResolvedValue(true);
  mocks.db.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = new URL(url, "https://x.test"), t = u.pathname.slice(1), p = u.searchParams;
    if (init?.method !== "POST") expect(p.get("company_id")).toBe(`eq.${c1}`);
    if (t === "pricing_documents") return [{ id: d1, content: { title: "이번 달 단가표" }, updated_at: "2026-11-02" }, { id: d2, content: { title: "신규" }, updated_at: "2026-11-01", archived_at: "2026-11-03" }];
    if (t === "pricing_document_versions") return [{ id: v1, document_id: d1, version: 3 }];
    if (t === "pricing_default_public_documents") return [];
    return [];
  });
});

describe("CX-140 company links API", () => {
  it("is 404 when the flag is off for the company and never reads", async () => {
    mocks.auth.mockResolvedValue({ ...customer(), companyId: c2 });
    expect((await GET(get())).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("denies a non-manager customer and anonymous callers", async () => {
    mocks.auth.mockResolvedValue(customer("staff")); expect((await GET(get())).status).toBe(403);
    mocks.auth.mockResolvedValue({ ok: false }); expect((await GET(get())).status).toBe(401);
  });
  it("lists links with views/last viewed/expiry, default flag, and skips archived documents", async () => {
    const body = await (await GET(get())).json();
    expect(body.documents).toEqual([{ id: d1, title: "이번 달 단가표" }]);
    expect(body.defaultDocumentId).toBe(d1); expect(body.defaultPinned).toBe(false);
    expect(body.links[0]).toMatchObject({ viewCount: 7, lastViewedAt: "2026-11-20T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z", isDefault: true, duplicateCount: 1 });
  });
  it("ensure creates the default link through the shared prepare path (one per document)", async () => {
    const response = await POST(post({ action: "ensure" }));
    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledWith(c1, expect.stringMatching(/^[0-9a-f]{64}$/), d1, v1);
  });
  it("set-default rejects a document that is not one of the company's published sheets", async () => {
    expect((await POST(post({ action: "set-default", documentId: d2 }))).status).toBe(404);
    expect((await POST(post({ action: "set-default", documentId: d1 }))).status).toBe(200);
    expect(mocks.db).toHaveBeenCalledWith("pricing_default_public_documents?on_conflict=company_id", expect.objectContaining({ method: "POST" }));
  });
  it("revoke only affects the caller's company and a public link", async () => {
    expect((await POST(post({ action: "revoke", linkId: l1 }))).status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith(c1, l1);
    mocks.revoke.mockResolvedValue(false);
    expect((await POST(post({ action: "revoke", linkId: l1 }))).status).toBe(404);
  });
  it("rejects cross-origin posts and the all-company list for customers", async () => {
    const bad = new NextRequest("https://app.test/api/company-links", { method: "POST", headers: { origin: "https://evil.test", host: "app.test" }, body: "{\"action\":\"ensure\"}" });
    expect((await POST(bad)).status).toBe(403);
    expect((await GET(get("?all=1"))).status).toBe(401);
  });
});
