import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { DocumentSendError, parseDocumentSend } from "../domains/pricing/document-send";
import { pricingDocuments } from "../application/pricing/documents";
const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/pricing/document-recalculation", () => ({ withDocumentRecalculations: vi.fn() }));
vi.mock("@/lib/feature-flags", () => import("../lib/feature-flags"));
vi.mock("@/domains/pricing/document", () => import("../domains/pricing/document"));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
import { POST } from "../app/api/pricing-documents/route";

const company = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const documentId = "10000000-0000-4000-8000-000000000001", versionId = "20000000-0000-4000-8000-000000000001";
const otherVersionId = "20000000-0000-4000-8000-000000000002";
const leadId = "30000000-0000-4000-8000-000000000001", customerId = "40000000-0000-4000-8000-000000000001";
const key = "50000000-0000-4000-8000-000000000001", email = "synthetic@example.test";
const actor = createHash("sha256").update(`${company}:customer:${email}`).digest("hex");
const scope = { companyId: company, actor, manager: false };
const input = { action: "record-send", documentVersionId: versionId, leadId, templateId: "sheet-v1", channel: "staff", idempotencyKey: key, delivered: true };
const service = pricingDocuments(pricingDocumentsRepository);
type Row = Record<string, string | null> & { id: string };
let rows: Map<string, Row>, kind: string, owner: string, documentCompany: string, targetCompany: string;
let failAfterInsert: boolean, failRead: boolean;

beforeEach(() => {
  vi.clearAllMocks(); rows = new Map(); kind = "sheet"; owner = actor; documentCompany = company; targetCompany = company;
  failAfterInsert = false; failRead = false;
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true"); vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company);
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { workspaceRole: "sales", email } });
  mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
    const url = new URL(path, "https://synthetic.test/"), table = url.pathname.slice(1), params = url.searchParams;
    if (init?.method === "POST") {
      expect(table).toBe("pricing_document_sends");
      expect(params.get("on_conflict")).toBe("company_id,idempotency_key");
      expect(init.headers).toEqual({ Prefer: "resolution=ignore-duplicates,return=minimal" });
      const row = JSON.parse(String(init.body)) as Row;
      const storageKey = `${row.company_id}:${row.idempotency_key}`;
      if (!rows.has(storageKey)) rows.set(storageKey, { ...row, id: `60000000-0000-4000-8000-${String(rows.size + 1).padStart(12, "0")}` });
      if (failAfterInsert) { failAfterInsert = false; throw new Error("synthetic response lost after commit"); }
      return undefined;
    }
    expect(params.get("company_id")).toBeTruthy();
    const tenant = params.get("company_id")!.slice(3);
    if (table === "pricing_document_versions") {
      const id = params.get("id")?.slice(3);
      return tenant === documentCompany && (id === versionId || id === otherVersionId) ? [{ id, document_id: documentId, content: { layout: "cards" } }] : [];
    }
    if (table === "pricing_documents") return tenant === documentCompany ? [{ id: documentId, kind, owner_key: owner }] : [];
    if (table === "business_permit_leads" || table === "normalized_customers") return tenant === targetCompany ? [{ id: table === "business_permit_leads" ? leadId : customerId }] : [];
    if (table === "pricing_document_sends") {
      if (failRead) { failRead = false; throw new Error("synthetic read unavailable"); }
      const row = rows.get(`${tenant}:${params.get("idempotency_key")!.slice(3)}`);
      return row ? [row] : [];
    }
    throw new Error(`Unexpected query ${table}`);
  });
});
afterEach(() => vi.unstubAllEnvs());
function request(body: object = input, origin = "https://synthetic.test") {
  return new NextRequest("https://synthetic.test/api/pricing-documents?companyId=forged", {
    method: "POST", headers: { origin }, body: JSON.stringify(body),
  });
}

it("returns the four-field consumer contract and persists server identity/layout only after delivery confirmation", async () => {
  const response = await POST(request({ ...input, companyId: other, actor: "forged", documentId: "forged", layout: "table", publicUrl: "https://forged.test" }));
  expect(response.status).toBe(200);
  const result = (await response.json()).result;
  expect(result).toEqual({ sendId: expect.any(String), documentId, documentVersionId: versionId, publicUrl: null });
  const saved = [...rows.values()][0];
  expect(saved).toMatchObject({ company_id: company, document_id: documentId, document_version_id: versionId, lead_id: leadId,
    customer_id: null, template_id: "sheet-v1", channel: "staff", layout: "cards", sent_by_key: actor });
  expect(saved).not.toHaveProperty("publicUrl");
  expect(mocks.db.mock.calls.every(([path]) => !String(path).includes("storefront_links"))).toBe(true);
});

it("concurrent same-input retries retain one record and sendId", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => service.execute(scope, input)));
  expect(new Set(results.map(result => JSON.stringify(result))).size).toBe(1);
  expect(rows.size).toBe(1);
});
it.each([{ channel: "print" }, { templateId: "other-template" }, { leadId: null, customerId }, { documentVersionId: otherVersionId }])("rejects changed input for the same key without updating the first record: %j", async change => {
  await POST(request()); const before = structuredClone([...rows.values()]);
  expect((await POST(request({ ...input, ...change }))).status).toBe(409);
  expect([...rows.values()]).toEqual(before);
});
it.each(["insert", "read"])("recovers the same ID after a lost %s response without another record", async stage => {
  failAfterInsert = stage === "insert"; failRead = stage === "read";
  expect((await POST(request())).status).toBe(503);
  const savedId = [...rows.values()][0].id;
  const retry = await POST(request());
  expect(retry.status).toBe(200); expect((await retry.json()).result.sendId).toBe(savedId); expect(rows.size).toBe(1);
});
it("supports the existing customer target without creating an order link", async () => {
  const response = await POST(request({ ...input, leadId: null, customerId, channel: "link" }));
  expect(response.status).toBe(200); expect((await response.json()).result.publicUrl).toBeNull();
  expect([...rows.values()][0]).toMatchObject({ lead_id: null, customer_id: customerId });
});
it.each([{ delivered: false }, { delivered: "true" }, { delivered: undefined }, { leadId: null }, { customerId }, { leadId: "bad" },
  { documentVersionId: "bad" }, { idempotencyKey: "bad" }, { channel: "email" }, { templateId: "" }, { templateId: "x".repeat(101) }])("rejects invalid or unconfirmed delivery before SQL: %j", async change => {
  expect((await POST(request({ ...input, ...change }))).status).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
});
it("canonicalizes UUID and template whitespace for retry comparison", () => {
  expect(parseDocumentSend({ ...input, templateId: " sheet-v1 ", idempotencyKey: key.toUpperCase() })).toMatchObject({ templateId: "sheet-v1", idempotencyKey: key });
});
it.each(["version", "target"])("rejects cross-company %s before inserting", async target => {
  if (target === "version") documentCompany = other; else targetCompany = other;
  expect((await POST(request())).status).toBe(404); expect(rows.size).toBe(0);
});
it("keeps company key namespaces separate", async () => {
  const first = await service.execute(scope, input);
  documentCompany = other; targetCompany = other;
  const second = await service.execute({ ...scope, companyId: other }, input);
  expect(second).not.toEqual(first); expect(rows.size).toBe(2);
});
it.each([false, true])("denies another author's quote even for a manager: %s", async manager => {
  kind = "quote"; owner = "other-author";
  await expect(service.execute({ ...scope, manager }, input)).rejects.toMatchObject({ status: 404 }); expect(rows.size).toBe(0);
});
it("allows the quote author and rejects reuse by another author", async () => {
  kind = "quote";
  await expect(service.execute(scope, input)).resolves.toHaveProperty("publicUrl", null);
  kind = "sheet";
  await expect(service.execute({ ...scope, actor: "another-actor" }, input)).rejects.toBeInstanceOf(DocumentSendError);
  expect(rows.size).toBe(1);
});
it.each(["driver", "member", "temporary"])("denies %s record-send without SQL", async workspaceRole => {
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { workspaceRole, role: "member", email } });
  expect((await POST(request())).status).toBe(403); expect(mocks.db).not.toHaveBeenCalled();
});
it("denies anonymous, excluded companies, OFF and cross-origin writes without SQL", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false }); expect((await POST(request())).status).toBe(401);
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", other); expect((await POST(request())).status).toBe(404);
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company); expect((await POST(request(input, "https://other.test"))).status).toBe(403);
  vi.stubEnv("PRICE_SHEETS_ENABLED", "false"); expect((await POST(request())).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});
