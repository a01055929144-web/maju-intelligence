import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { lineFromCatalog, type DocumentContent } from "../domains/pricing/document";
import { pricingDocuments } from "../application/pricing/documents";
const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
import { POST as publicPost } from "../app/api/pricing-documents/public/route";
import { POST as privatePost } from "../app/api/pricing-documents/route";
import { issueDocumentShareToken, verifyDocumentShareToken } from "../lib/pricing/document-share-token";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";

const company = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const doc = "10000000-0000-4000-8000-000000000001", version = "20000000-0000-4000-8000-000000000001";
const lead = "30000000-0000-4000-8000-000000000001", key = "40000000-0000-4000-8000-000000000001";
const actor = createHash("sha256").update(`${company}:customer:synthetic@example.test`).digest("hex");
const scope = { companyId: company, actor, manager: false, sharingEnabled: true };
const service = pricingDocuments(pricingDocumentsRepository);
const prepare = { action: "prepare-share", documentVersionId: version, leadId: lead, idempotencyKey: key };
type Row = Record<string, string | number | null>;
let links: Row[], sends: Row[], content: DocumentContent, owner: string, merged: boolean, archived: boolean;
let failInsert: boolean, failBinding: boolean, limit: string, stock: number;
const seen: string[] = [];

beforeEach(() => {
  vi.clearAllMocks(); links = []; sends = []; seen.length = 0; owner = actor; merged = archived = failInsert = failBinding = false; limit = "allowed"; stock = 2;
  vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "true"); vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", company);
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true"); vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company);
  vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET", "synthetic-test-key-for-lead-document-only-32");
  vi.stubEnv("STORE_LINK_SECRET", "synthetic-test-key-for-store-document-only-32");
  content = { kind: "quote", title: "합성 견적", companyName: "합성 회사", contact: "PRIVATE-CONTACT-CANARY", recipient: "PRIVATE-LEAD-CANARY", footer: "PRIVATE-FOOTER-CANARY",
    validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [{ key: "private", label: "secret", value: "PRIVATE-INFO-CANARY", place: "header" }], productWidth: 65, priceIncludesTax: true },
    lines: [lineFromCatalog({ id: "50000000-0000-4000-8000-000000000001", name: "합성 품목", displayName: "합성 품목", brand: "공개 브랜드", spec: "18L", unit: "통", price: 1000, taxType: "taxable", cost: 777777 })] };
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { workspaceRole: "sales", email: "synthetic@example.test" } });
  mocks.db.mockImplementation(async (url: string, init?: RequestInit) => {
    seen.push(url);
    const u = new URL(url, "https://fixture.test/"), table = u.pathname.slice(1), p = u.searchParams;
    if (table === "rpc/pricing_s2_public_request_guard") {
      const b = JSON.parse(String(init?.body));
      expect(b.p_requester_hash).toMatch(/^[a-f0-9]{64}$/); expect(Object.keys(b.p_payload)).toEqual(["shareLinkId"]);
      expect(JSON.stringify(b)).not.toContain("synthetic-test-key");
      return limit;
    }
    const matches = (r: Row) => Array.from(p.entries()).every(([k, v]) => !v.startsWith("eq.") || r[k] === v.slice(3)) &&
      Array.from(p.entries()).every(([k, v]) => v !== "is.null" || r[k] == null);
    if (table === "pricing_document_share_links" || table === "pricing_document_sends") {
      const rows = table.endsWith("share_links") ? links : sends;
      if (init?.method === "POST") {
        const b = JSON.parse(String(init.body)) as Row;
        expect(p.get("on_conflict")).toBe("company_id,idempotency_key");
        expect(init.headers).toEqual({ Prefer: "resolution=ignore-duplicates,return=minimal" });
        if (!rows.some(r => r.company_id === b.company_id && r.idempotency_key === b.idempotency_key)) rows.push({
          id: "60000000-0000-4000-8000-000000000001", created_at: new Date().toISOString(), expires_at: "2099-01-01T00:00:00Z", revoked_at: null, send_id: null, ...b,
        });
        if (failInsert) { failInsert = false; throw new Error("synthetic lost commit response"); }
        return;
      }
      if (init?.method === "PATCH") {
        if (failBinding && table.endsWith("share_links")) { failBinding = false; throw new Error("synthetic lost binding response"); }
        rows.filter(matches).forEach(r => Object.assign(r, JSON.parse(String(init.body)))); return;
      }
      return rows.filter(matches);
    }
    if (p.get("company_id") !== `eq.${company}`) return [];
    if (table === "pricing_document_versions") return p.get("id") === `eq.${version}` ? [{ id: version, document_id: doc, version: 2, revision: 3, published_at: "2026-11-06T00:00:00Z", content: { ...content, cost: "COST-CANARY", supplier: "SUPPLIER-CANARY" } }] : [];
    if (table === "pricing_documents") return [{ id: doc, kind: content.kind, owner_key: owner, archived_at: archived ? "2026-11-06" : null }];
    if (table === "business_permit_leads") return merged ? [] : [{ id: lead }];
    if (table === "pricing_promotions") return [{ id: content.lines[0].promotionId, stock, starts_on: "2020-01-01", ends_on: "2099-12-31" }];
    throw new Error(`Unexpected fixture query ${table}`);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
function request(body: unknown, origin = "https://fixture.test", extra: Record<string, string> = {}) {
  return new NextRequest("https://fixture.test/api/pricing-documents/public", { method: "POST", headers: { "Content-Type": "application/json", origin, ...extra }, body: JSON.stringify(body) });
}
async function prepared() {
  return service.execute<import("../domains/pricing/document-share").PreparedDocumentShare>(scope, prepare);
}
function token(url: string) { return url.split("#")[1]; }

it("prepares once under concurrent retries without delivery and restores its original URL", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, prepared));
  expect(new Set(results.map(r => JSON.stringify(r))).size).toBe(1); expect(links).toHaveLength(1); expect(sends).toHaveLength(0);
  expect(results[0]).toMatchObject({ sendId: null, deliveryRecorded: false, documentId: doc, documentVersionId: version });
  expect(links[0]).not.toHaveProperty("token"); expect(links[0]).not.toHaveProperty("publicUrl");
});
it("restores a committed preparation after a lost response", async () => {
  failInsert = true; await expect(prepared()).rejects.toThrow();
  const row = structuredClone(links[0]); const result = await prepared();
  expect(result.shareLinkId).toBe(row.id); expect(links).toEqual([row]);
});
it.each([{ ttlDays: 15 }, { documentVersionId: "20000000-0000-4000-8000-000000000002" }, { leadId: "30000000-0000-4000-8000-000000000002" }])("never replaces a prior request: %j", async change => {
  await prepared(); const before = structuredClone(links);
  await expect(service.execute(scope, { ...prepare, ...change })).rejects.toBeTruthy(); expect(links).toEqual(before);
});
it.each([false, true])("denies other-author external quotes even for manager=%s", async manager => {
  owner = "other-author"; await expect(service.execute({ ...scope, manager }, prepare)).rejects.toMatchObject({ status: 404 }); expect(links).toHaveLength(0);
});
it("allows shared sheet issuance but denies another issuer's retry and cross-company scope", async () => {
  content.kind = "sheet"; owner = "other-author"; await prepared();
  await expect(service.execute({ ...scope, actor: "another-actor" }, prepare)).rejects.toMatchObject({ status: 409 });
  await expect(service.execute({ ...scope, companyId: other }, prepare)).rejects.toMatchObject({ status: 404 });
});
it.each(["merged", "archived", "expired"])("rejects %s document/lead before preparing", async state => {
  merged = state === "merged"; archived = state === "archived"; if (state === "expired") content.validUntil = "2020-01-01";
  await expect(prepared()).rejects.toMatchObject({ status: 404 }); expect(links).toHaveLength(0);
});
it.each([0, 31, 1.5, "14"])("rejects invalid TTL %s before SQL", async ttlDays => {
  expect(() => service.execute(scope, { ...prepare, ttlDays })).toThrow(); expect(mocks.db).not.toHaveBeenCalled();
});
it("returns only pinned public sales data and never private info, costs or IDs", async () => {
  const p = await prepared(), r = await publicPost(request({ token: token(p.publicUrl) }));
  expect(r.status).toBe(200); const b = await r.json();
  expect(b.document.lines[0]).toMatchObject({ price: 1100, spec: "18L", brand: "공개 브랜드" });
  expect(b.document.version).toBe(2); expect(JSON.stringify(b)).not.toMatch(/CANARY|777777|owner_key|productId|company_id|leadId|documentId|cost|supplier/);
  expect(r.headers.get("cache-control")).toBe("private, no-store"); expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  expect(seen.some(s => /pricing_items|product_catalog|customer_price_agreements|record_pricing_document_acceptance/.test(s))).toBe(false);
});
it("hides sales prices at the KST date boundary and showPrice=false", async () => {
  content.validUntil = "2026-11-06"; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T14:59:59Z"));
  const p = await prepared();
  expect((await (await publicPost(request({ token: token(p.publicUrl) }))).json()).document.lines[0].price).toBe(1100);
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  expect((await (await publicPost(request({ token: token(p.publicUrl) }))).json()).document.lines[0].price).toBeNull();
  content.validUntil = "2099-12-31"; content.showPrice = false;
  expect((await (await publicPost(request({ token: token(p.publicUrl) }))).json()).document.lines[0].price).toBeNull();
});
it("uses current promotion availability but never current promotion prices", async () => {
  Object.assign(content.lines[0], { promotionId: "70000000-0000-4000-8000-000000000001", startsOn: "2020-01-01", endsOn: "2099-12-31", remaining: 10, badge: "행사" });
  const p = await prepared(); stock = 0;
  expect((await (await publicPost(request({ token: token(p.publicUrl) }))).json()).document.lines).toEqual([]);
  stock = 2;
  expect((await (await publicPost(request({ token: token(p.publicUrl) }))).json()).document.lines[0]).toMatchObject({ remaining: 2, price: 1100 });
});
it("rejects wrong purpose, tampering and rotated keys without a document lookup", async () => {
  const p = await prepared(); seen.length = 0;
  for (const value of [issueStoreLinkToken(p.shareLinkId).token, token(p.publicUrl).slice(0, -1) + "x", "invalid"]) expect((await publicPost(request({ token: value }))).status).toBe(404);
  expect(seen).toEqual([]);
  vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET", "rotated-synthetic-test-secret-32-bytes-long");
  expect((await publicPost(request({ token: token(p.publicUrl) }))).status).toBe(404);
  await expect(prepared()).rejects.toMatchObject({ status: 409 });
});
it("keeps nonce and signing purposes separate even if deployment keys are accidentally equal", () => {
  vi.stubEnv("STORE_LINK_SECRET", process.env.LEAD_DOCUMENT_LINK_SECRET!);
  expect(verifyDocumentShareToken(issueStoreLinkToken(doc).token)).toBeNull();
  const issued = issueDocumentShareToken(doc); expect(verifyDocumentShareToken(issued.token)).toMatchObject({ id: doc, hash: issued.hash });
});
it.each(["revoked", "expired", "merged", "company"])("returns the same content-free 404 for %s links", async state => {
  const p = await prepared();
  if (state === "revoked") await service.execute(scope, { action: "revoke-share", shareLinkId: p.shareLinkId });
  if (state === "expired") links[0].expires_at = "2020-01-01T00:00:00Z";
  if (state === "merged") merged = true;
  if (state === "company") vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", other);
  const r = await publicPost(request({ token: token(p.publicUrl) })); expect(r.status).toBe(404); expect(await r.json()).toEqual({ message: "공유 문서를 사용할 수 없습니다." });
});
it("retries delivery binding with the original send ID and only marks sent records viewed", async () => {
  const p = await prepared();
  const input = { action: "record-send", shareLinkId: p.shareLinkId, documentVersionId: version, leadId: lead, idempotencyKey: key, delivered: true, templateId: "pricing-doc-paper-v1", channel: "link" };
  failBinding = true;
  expect((await privatePost(request(input))).status).toBe(503); expect(sends).toHaveLength(1);
  const result = await (await privatePost(request(input))).json();
  expect(result.result).toMatchObject({ sendId: sends[0].id, publicUrl: p.publicUrl }); expect(links[0].send_id).toBe(sends[0].id);
  sends[0].acceptance_status = "accepted";
  await publicPost(request({ token: token(p.publicUrl) })); expect(sends[0].acceptance_status).toBe("accepted");
  sends[0].acceptance_status = "sent"; sends[0].viewed_at = null;
  await publicPost(request({ token: token(p.publicUrl) })); expect(sends[0].acceptance_status).toBe("viewed");
});
it("rejects mismatched delivery key before a send insert and requires delivered:true", async () => {
  const p = await prepared();
  const input = { action: "record-send", shareLinkId: p.shareLinkId, documentVersionId: version, leadId: lead, idempotencyKey: "40000000-0000-4000-8000-000000000002", delivered: true, templateId: "pricing-doc-paper-v1", channel: "link" };
  expect((await privatePost(request(input))).status).toBe(409); expect(sends).toHaveLength(0);
  expect((await privatePost(request({ ...input, delivered: false }))).status).toBe(400);
});
it("enforces strict same-origin JSON, actual body bytes and token-only input before DB reads", async () => {
  for (const b of [{ token: "x", companyId: company }, { token: "x".repeat(201) }, { token: "한글" }, { token: "x", padding: "x".repeat(1024) }]) expect((await publicPost(request(b))).status).toBe(404);
  expect((await publicPost(request({ token: "x" }, "https://other.test"))).status).toBe(403);
  expect((await publicPost(request({ token: "x" }, "null"))).status).toBe(403);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("limits prepare/read separately and fails closed on guard/storage failure", async () => {
  const p = await prepared(); limit = "rate_limited";
  expect((await publicPost(request({ token: token(p.publicUrl) }))).status).toBe(429);
  expect((await privatePost(request(prepare))).status).toBe(429);
  limit = "invalid"; expect((await publicPost(request({ token: token(p.publicUrl) }))).status).toBe(503);
  mocks.db.mockRejectedValueOnce(new Error("synthetic storage outage")); expect((await publicPost(request({ token: token(p.publicUrl) }))).status).toBe(503);
});
it("keeps every new-table access off for default OFF, excluded companies and anonymous staff actions", async () => {
  vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "false");
  expect((await publicPost(request({ token: "x" }))).status).toBe(404);
  expect((await privatePost(request(prepare))).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
  vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "true"); vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", "");
  expect((await privatePost(request(prepare))).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValueOnce({ ok: false }); expect((await privatePost(request(prepare))).status).toBe(401);
});
