import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { lineFromCatalog, type DocumentContent } from "../domains/pricing/document";
import { pricingDocuments } from "../application/pricing/documents";
const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth, getCustomerOperationalName: (session: { name?: string } | undefined) => session?.name }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
import { POST as publicPost } from "../app/api/pricing-documents/public/route";
import { POST as privatePost } from "../app/api/pricing-documents/route";
import { getPublicDocumentOrderContext } from "../lib/pricing/document-share";
import { issueDocumentShareToken, verifyDocumentShareToken } from "../lib/pricing/document-share-token";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";

const company = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const doc = "10000000-0000-4000-8000-000000000001", version = "20000000-0000-4000-8000-000000000001";
const lead = "30000000-0000-4000-8000-000000000001", key = "40000000-0000-4000-8000-000000000001";
const actor = createHash("sha256").update(`${company}:customer:synthetic@example.test`).digest("hex");
const scope = { companyId: company, actor, manager: false, sharingEnabled: true };
const service = pricingDocuments(pricingDocumentsRepository);
const prepare = { action: "prepare-share", documentId: doc, documentVersionId: version, leadId: lead, idempotencyKey: key };
type Row = Record<string, string | number | null>;
let links: Row[], sends: Row[], actions: Row[], content: DocumentContent, owner: string, merged: boolean, archived: boolean;
let failInsert: boolean, failBinding: boolean, limit: string, stock: number;
const seen: string[] = [];

beforeEach(() => {
  vi.clearAllMocks(); links = []; sends = []; actions = []; seen.length = 0; owner = actor; merged = archived = failInsert = failBinding = false; limit = "allowed"; stock = 2;
  vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "true"); vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", company);
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true"); vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company);
  vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET", "synthetic-test-key-for-lead-document-only-32");
  vi.stubEnv("STORE_LINK_SECRET", "synthetic-test-key-for-store-document-only-32");
  content = { kind: "quote", title: "합성 견적", companyName: "합성 회사", contact: "PRIVATE-CONTACT-CANARY", recipient: "PRIVATE-LEAD-CANARY", footer: "PRIVATE-FOOTER-CANARY",
    validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [{ key: "private", label: "secret", value: "PRIVATE-INFO-CANARY", place: "header" }], productWidth: 65, priceIncludesTax: true },
    lines: [lineFromCatalog({ id: "50000000-0000-4000-8000-000000000001", name: "합성 품목", displayName: "합성 품목", brand: "공개 브랜드", spec: "18L", unit: "통", price: 1000, taxType: "taxable", cost: 777777 })] };
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { workspaceRole: "sales", name: "합성 세션 담당", email: "synthetic@example.test" } });
  mocks.db.mockImplementation(async (url: string, init?: RequestInit) => {
    seen.push(url);
    const u = new URL(url, "https://fixture.test/"), table = u.pathname.slice(1), p = u.searchParams;
    if (table === "rpc/pricing_s2_public_request_guard") {
      const b = JSON.parse(String(init?.body));
      expect(b.p_requester_hash).toMatch(/^[a-f0-9]{64}$/); expect(Object.keys(b.p_payload)).toEqual(["shareLinkId"]);
      expect(b.p_limit).toBe(b.p_route_key === "lead-document-prepare-v1" ? 10 : 20);
      expect(JSON.stringify(b)).not.toContain("synthetic-test-key");
      return limit;
    }
    if (table === "rpc/record_pricing_lead_share_delivery") {
      const b = JSON.parse(String(init?.body));
      const l = links.find(r => r.id === b.p_share_link_id && r.company_id === b.p_company_id)!;
      let saved = sends.find(r => r.company_id === b.p_company_id && r.idempotency_key === b.p_idempotency_key);
      if (saved && (saved.template_id !== b.p_template_id || saved.channel !== b.p_channel || saved.sent_by_key !== b.p_actor)) throw new Error("share_delivery_conflict");
      if (!saved) {
        saved = { id: "60000000-0000-4000-8000-000000000001", company_id: b.p_company_id, document_id: b.p_document_id,
          document_version_id: b.p_document_version_id, lead_id: b.p_lead_id, customer_id: null, template_id: b.p_template_id,
          channel: b.p_channel, idempotency_key: b.p_idempotency_key, sent_by_key: b.p_actor };
        sends.push(saved);
      }
      if (!actions.some(a => a.id === saved!.id)) actions.push({ id: saved.id, company_id: b.p_company_id, lead_id: b.p_lead_id, actor_name: b.p_actor_name });
      l.send_id = saved.id;
      if (failBinding) { failBinding = false; throw new Error("synthetic atomic commit response lost"); }
      return { sendId: saved.id, leadActionId: saved.id, documentId: saved.document_id, documentVersionId: saved.document_version_id };
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
  expect(new Set(results.map(r => JSON.stringify(r))).size).toBe(1); expect(links).toHaveLength(1); expect(sends).toHaveLength(0); expect(actions).toHaveLength(0);
  expect(results[0]).toMatchObject({ sendId: null, deliveryRecorded: false, documentId: doc, documentVersionId: version });
  expect(links[0]).not.toHaveProperty("token"); expect(links[0]).not.toHaveProperty("publicUrl");
});
it("restores a committed preparation after a lost response", async () => {
  failInsert = true; await expect(prepared()).rejects.toThrow();
  const row = structuredClone(links[0]); const result = await prepared();
  expect(result.shareLinkId).toBe(row.id); expect(links).toEqual([row]);
});
it.each([{ documentId: "10000000-0000-4000-8000-000000000002" }, { ttlDays: 15 }, { documentVersionId: "20000000-0000-4000-8000-000000000002" }, { leadId: "30000000-0000-4000-8000-000000000002" }])("never replaces a prior request: %j", async change => {
  await prepared(); const before = structuredClone(links);
  await expect(service.execute(scope, { ...prepare, ...change })).rejects.toMatchObject({ status: 409 }); expect(links).toEqual(before);
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
it("restores an existing hard-valid link after its prices expire but never issues a fresh expired version", async () => {
  content.validUntil = "2026-11-06"; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T14:59:59Z"));
  const p = await prepared(); vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  expect(await prepared()).toEqual(p);
  await expect(service.execute(scope, { ...prepare, idempotencyKey: "40000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ status: 404 });
  expect(links).toHaveLength(1);
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
it.each(["revoked", "expired", "merged", "company", "author", "archived"])("returns the same content-free 404 for %s links", async state => {
  const p = await prepared();
  if (state === "revoked") await service.execute(scope, { action: "revoke-share", shareLinkId: p.shareLinkId });
  if (state === "expired") links[0].expires_at = "2020-01-01T00:00:00Z";
  if (state === "merged") merged = true;
  if (state === "author") owner = "another-author";
  if (state === "archived") archived = true;
  if (state === "company") vi.stubEnv("LEAD_DOCUMENT_SHARING_COMPANY_IDS", other);
  const r = await publicPost(request({ token: token(p.publicUrl) })); expect(r.status).toBe(404); expect(await r.json()).toEqual({ message: "공유 문서를 사용할 수 없습니다." });
});
it("restores atomic delivery and contact records after commit response loss and only marks sent records viewed", async () => {
  const p = await prepared();
  const input = { action: "record-send", shareLinkId: p.shareLinkId, documentVersionId: version, leadId: lead, idempotencyKey: key, delivered: true, templateId: "pricing-doc-paper-v1", channel: "link" };
  failBinding = true;
  expect((await privatePost(request(input))).status).toBe(503); expect(sends).toHaveLength(1); expect(actions).toHaveLength(1);
  const result = await (await privatePost(request(input))).json();
  expect(result.result).toMatchObject({ sendId: sends[0].id, publicUrl: p.publicUrl }); expect(links[0].send_id).toBe(sends[0].id); expect(result.result.leadActionId).toBe(actions[0].id); expect(actions).toHaveLength(1);
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
  expect((await publicPost(request({ token: "x" }, "https://fixture.test", { "Content-Type": "application/jsonevil" }))).status).toBe(404);
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
it("does not query the sharing table when every allowed company's PRICING gate is off", async () => {
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", other);
  expect((await publicPost(request({ token: "x" }))).status).toBe(404); expect(mocks.db).not.toHaveBeenCalled();
});
it("does not trust client forwarded headers or put a raw IP into request audit arguments", async () => {
  const p = await prepared(); vi.stubEnv("VERCEL", "0");
  for (const ip of ["192.0.2.1", "192.0.2.2"]) await publicPost(request({ token: token(p.publicUrl) }, "https://fixture.test", { "x-forwarded-for": ip, "x-vercel-forwarded-for": ip }));
  let reads = mocks.db.mock.calls.filter(([path]) => path === "rpc/pricing_s2_public_request_guard").slice(-2).map(([, init]) => JSON.parse(init.body));
  expect(reads[0].p_requester_hash).toBe(reads[1].p_requester_hash);
  vi.stubEnv("VERCEL", "1");
  await publicPost(request({ token: token(p.publicUrl) }, "https://fixture.test", { "x-vercel-forwarded-for": "192.0.2.1" }));
  reads = mocks.db.mock.calls.filter(([path]) => path === "rpc/pricing_s2_public_request_guard").slice(-1).map(([, init]) => JSON.parse(init.body));
  expect(JSON.stringify(reads)).not.toContain("192.0.2.1");
});

it("rejects a selected-document mismatch before inserting a link", async () => {
  await expect(service.execute(scope, { ...prepare, documentId: "10000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ status: 409 });
  expect(links).toHaveLength(0); expect(sends).toHaveLength(0);
});

it("concurrent actual-delivery retries retain one send, one contact action and the same IDs", async () => {
  const p = await prepared();
  const input = { action: "record-send", shareLinkId: p.shareLinkId, documentVersionId: version, leadId: lead,
    idempotencyKey: key, delivered: true, templateId: "pricing-doc-paper-v1", channel: "link" };
  const results = await Promise.all(Array.from({ length: 6 }, () => service.execute(scope, input)));
  expect(new Set(results.map(r => JSON.stringify(r))).size).toBe(1);
  expect(sends).toHaveLength(1); expect(actions).toHaveLength(1); expect(links[0].send_id).toBe(sends[0].id);
  await expect(service.execute(scope, { ...input, templateId: "different-template" })).rejects.toMatchObject({ status: 409 });
  expect(sends).toHaveLength(1); expect(actions).toHaveLength(1);
});

it.each(["revoked", "expired"])("rejects new %s delivery but restores the original committed IDs", async state => {
  const p = await prepared();
  const input = { action: "record-send", shareLinkId: p.shareLinkId, documentVersionId: version, leadId: lead,
    idempotencyKey: key, delivered: true, templateId: "pricing-doc-paper-v1", channel: "link", actorName: "위조 이름" };
  if (state === "revoked") links[0].revoked_at = "2026-11-06T00:00:00Z"; else links[0].expires_at = "2020-01-01T00:00:00Z";
  expect((await privatePost(request(input))).status).toBe(404); expect(sends).toHaveLength(0); expect(actions).toHaveLength(0);
  links[0].revoked_at = null; links[0].expires_at = "2099-01-01T00:00:00Z";
  const first = await (await privatePost(request(input))).json();
  expect(actions[0].actor_name).toBe("합성 세션 담당");
  if (state === "revoked") links[0].revoked_at = "2026-11-06T00:00:00Z"; else links[0].expires_at = "2020-01-01T00:00:00Z";
  const retry = await privatePost(request(input)); expect(retry.status).toBe(200); expect(await retry.json()).toEqual(first);
  expect(sends).toHaveLength(1); expect(actions).toHaveLength(1);
});

it("exposes acceptance only for delivered, unexpired shares inside all company gates", async () => {
  const p = await prepared();
  const read = async () => (await (await publicPost(request({ token: token(p.publicUrl) }))).json()).acceptanceAvailable;
  vi.stubEnv("QUOTE_ACCEPTANCE", "true"); vi.stubEnv("QUOTE_ACCEPTANCE_COMPANY_IDS", company);
  vi.stubEnv("STORE_ORDERING_ENABLED", "true"); vi.stubEnv("FEATURE_STORE_ORDERING_COMPANY_IDS", company);
  vi.stubEnv("STORE_PUBLIC_BASE_URL", "https://store.example.test");
  expect(await read()).toBe(false);
  links[0].send_id = "60000000-0000-4000-8000-000000000001";
  expect(await read()).toBe(true);
  vi.stubEnv("QUOTE_ACCEPTANCE_COMPANY_IDS", other); expect(await read()).toBe(false);
  vi.stubEnv("QUOTE_ACCEPTANCE_COMPANY_IDS", company);
  vi.stubEnv("QUOTE_ACCEPTANCE", "false"); expect(await read()).toBe(false);
  vi.stubEnv("QUOTE_ACCEPTANCE", "true");
  content.validUntil = "2020-01-01"; expect(await read()).toBe(false);
});


it("creates a recipient-free public document without lead lookup, delivery or customer writes", async () => {
  vi.stubEnv("PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED", "true");
  const input = { ...prepare, leadId: null };
  const result = await service.execute<import("../domains/pricing/document-share").PreparedDocumentShare>(scope, input);
  expect(links[0].lead_id).toBeNull(); expect(sends).toHaveLength(0); expect(actions).toHaveLength(0);
  expect(seen.some(url => /business_permit_leads|normalized_customers|store_accounts|store_orders/.test(url))).toBe(false);
  const response = await publicPost(request({ token: token(result.publicUrl) }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.orderEntry).toMatchObject({ available: true, companyName: content.companyName, version: 2 });
  expect(body.acceptanceAvailable).toBe(false);
  expect(JSON.stringify(body)).not.toMatch(/CANARY|company_id|customerId|documentId|leadId|productId|cost|supplier/);
  expect(await getPublicDocumentOrderContext(token(result.publicUrl), "fixture")).toMatchObject({ companyId: company, documentId: doc, documentVersionId: version, shareLinkId: result.shareLinkId });
  expect(await service.execute(scope, input)).toEqual(result);
  expect(links).toHaveLength(1); expect(sends).toHaveLength(0); expect(actions).toHaveLength(0);
});
it("keeps recipient-free creation and context OFF before any database query", async () => {
  vi.stubEnv("PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED", "false");
  await expect(service.execute(scope, { ...prepare, leadId: null })).rejects.toThrow();
  await expect(getPublicDocumentOrderContext("untrusted", "fixture")).rejects.toThrow();
  expect(seen).toHaveLength(0);
});
it("rejects revoked, expired, foreign-owned and targeted links for public signup context", async () => {
  vi.stubEnv("PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED", "true");
  const result = await service.execute<import("../domains/pricing/document-share").PreparedDocumentShare>(scope, { ...prepare, leadId: null });
  const t = token(result.publicUrl);
  links[0].revoked_at = new Date().toISOString();
  await expect(getPublicDocumentOrderContext(t, "fixture")).rejects.toThrow();
  links[0].revoked_at = null; links[0].expires_at = "2000-01-01T00:00:00Z";
  await expect(getPublicDocumentOrderContext(t, "fixture")).rejects.toThrow();
  links[0].expires_at = "2099-01-01T00:00:00Z"; owner = "foreign-owner";
  await expect(getPublicDocumentOrderContext(t, "fixture")).rejects.toThrow();
  owner = actor; links[0].lead_id = lead;
  await expect(getPublicDocumentOrderContext(t, "fixture")).rejects.toThrow();
});
