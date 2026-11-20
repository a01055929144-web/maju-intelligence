import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({ company: "10000000-0000-4000-8000-000000000001", rpcCalls: 0 }));
vi.mock("../lib/auth", () => ({
  getRequestAuthScope: async () => ({ ok: true, companyId: state.company,
    customerSession: { workspaceRole: "owner", userId: "synthetic-owner", email: "owner@example.test" } }),
  getCustomerOperationalName: () => "합성",
}));
vi.mock("../lib/store", () => ({ getSupabaseConfig: () => null, supabaseRequest: (path: string, init?: RequestInit) => databaseRequest(path, init) }));
import { POST } from "../app/api/pricing-documents/route";
import { documentRequest } from "../lib/pricing/document-client";
import { reviewDocumentExtension, publishDocumentExtension, readDocumentExtensionCatalog } from "../lib/pricing/document-extension-client";
import type { DocumentDraft } from "../domains/pricing/document";

const company = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const documentId = "40000000-0000-4000-8000-000000000001";
const productId = "30000000-0000-4000-8000-000000000001";
const shareId = "60000000-0000-4000-8000-000000000001";
const originalVersion = "50000000-0000-4000-8000-000000000001";

function query(sql: string) {
  return execFileSync("psql", ["-X", "-A", "-t", "--set=ON_ERROR_STOP=1", "--command", sql],
    { encoding: "utf8", timeout: 15000 }).trim();
}
function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "ARRAY[" + value.map(literal).join(",") + "]::uuid[]";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return "'" + (typeof value === "object" ? JSON.stringify(value) : String(value)).replaceAll("'", "''") + "'" +
    (typeof value === "object" ? "::jsonb" : "");
}
const parameters: Record<string, string[]> = {
  pricing_document_extension_review_v1: ["p_company", "p_actor", "p_manager", "p_document", "p_expected", "p_mode", "p_valid_until", "p_stage", "p_content", "p_token_hash"],
  pricing_document_extension_catalog_v1: ["p_company", "p_actor", "p_manager", "p_document", "p_expected", "p_mode", "p_product_ids"],
  pricing_document_extension_save_v1: ["p_company", "p_actor", "p_manager", "p_document", "p_expected", "p_mode", "p_content"],
  pricing_document_extension_publish_v1: ["p_company", "p_actor", "p_manager", "p_document", "p_expected", "p_mode", "p_token_hash", "p_idempotency_key"],
  pricing_p1: ["p_company", "p_actor", "p_manager", "p_action", "p_payload"],
};
async function databaseRequest(path: string, init?: RequestInit) {
  if (path.startsWith("pricing_documents?") && !init) {
    const params = new URLSearchParams(path.split("?")[1]);
    return JSON.parse(query("select coalesce(jsonb_agg(jsonb_build_object('content',content)),'[]') from pricing_documents where company_id=" +
      literal(params.get("company_id")?.slice(3)) + " and id=" + literal(params.get("id")?.slice(3))));
  }
  const name = path.startsWith("rpc/") ? path.slice(4) : "";
  const keys = parameters[name];
  if (!keys || init?.method !== "POST") throw new Error("Unexpected fixture transport: " + path);
  state.rpcCalls++;
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  try { return JSON.parse(query("select public." + name + "(" + keys.map(key => literal(body[key])).join(",") + ")")); }
  catch (error) {
    const message = String((error as { stderr?: unknown }).stderr ?? error).match(/ERROR:\s+([^\r\n]+)/)?.[1] ?? "fixture_query_failed";
    throw new Error("Supabase request failed: 400 " + JSON.stringify({ code: "P0001", message }));
  }
}

describe.skipIf(process.env.CX121_API_PG17 !== "true")("CX-121 real POST handler and repository against isolated PG17", () => {
  beforeAll(() => {
    if (process.env.PGHOST !== "127.0.0.1" || process.env.PGDATABASE !== "cx121_api_connection_test")
      throw new Error("Disposable loopback CX121 database required");
    const folder = mkdtempSync(join(tmpdir(), "cx121-api-"));
    const root = "docs/sql-drafts/";
    for (const file of ["2026-11-20-CX-121-document-extension.sql", "2026-11-20-CX-121-document-extension.down.sql"])
      writeFileSync(join(folder, file), readFileSync(root + file));
    const fixture = readFileSync(root + "2026-11-20-CX-121-document-extension.pg17.test.sql", "utf8");
    const prefix = fixture.slice(0, fixture.indexOf("do $$ declare r jsonb;"));
    const original = readFileSync(root + "20261030-pricing-p1.sql", "utf8");
    const start = original.indexOf("create function public.pricing_p1(");
    const closing = "\nend $$;";
    const end = original.indexOf(closing, start);
    if (start < 0 || end < 0) throw new Error("Original pricing_p1 function required");
    writeFileSync(join(folder, "setup.sql"), prefix + "\ncreate table public.pricing_product_sets(id uuid primary key);\n" +
      original.slice(start, end + closing.length));
    execFileSync("psql", ["-X", "--set=ON_ERROR_STOP=1", "--file", join(folder, "setup.sql")], { timeout: 15000 });
    vi.stubEnv("PRICE_SHEETS_ENABLED", "true");
    vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company + "," + other);
    vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "true");
    vi.stubEnv("PRICING_DOCUMENT_EXTENSION_COMPANY_IDS", company + "," + other);
    vi.stubEnv("LEAD_DOCUMENT_SHARING_ENABLED", "false");
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (!url.startsWith("/api/pricing-documents?") || init?.method !== "POST") throw new Error("Unexpected HTTP fixture request");
      return POST(new NextRequest("https://synthetic.test" + url, { ...init,
        headers: { ...init.headers, origin: "https://synthetic.test" } }));
    });
  }, 30000);
  afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("preserves hidden lines, prices, tenant scope, stable link and publication replay; blocks an ordinary publish bypass", async () => {
    const start = await reviewDocumentExtension(company, { id: documentId, expected: 1, mode: "latest", validUntil: "2099-12-31", stage: "start" });
    expect(start.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(start.content.lines).toHaveLength(2);
    expect(start.content.lines[1].visible).toBe(false);
    expect(start.lines[0]).toMatchObject({ source: "catalog", calculated: 1200 });
    const catalog = await readDocumentExtensionCatalog(company, { id: documentId, expected: 1, mode: "latest" }, { productIds: [productId] });
    expect(catalog.items[0].price).toBe(1200);
    expect(catalog.items[0]).not.toHaveProperty("cost");
    const candidate = { ...start.content, lines: start.content.lines.map((line, index) => index === 0 ? { ...line, price: 900 } : line) };
    const saved = (await documentRequest<DocumentDraft>(company, "extension-save", { id: documentId, expected: 1, mode: "latest", content: candidate }, true)).result;
    const review = await reviewDocumentExtension(company, { id: documentId, expected: saved.revision, mode: "latest", validUntil: candidate.validUntil, stage: "review", content: saved.content });
    expect(review.content.lines[1].visible).toBe(false);
    expect(review.lines[0]).toMatchObject({ price: 900, calculated: 1200, difference: -300 });
    const input = { id: documentId, expected: saved.revision, mode: "latest" as const, token: review.token, idempotencyKey: "80000000-0000-4000-8000-000000000010" };
    state.company = other;
    await expect(publishDocumentExtension(company, input)).rejects.toThrow();
    state.company = company;
    expect(query("select count(*) from pricing_document_versions")).toBe("1");
    query("update price_fixture set price=1300 where product_id=" + literal(productId));
    await expect(publishDocumentExtension(company, input)).rejects.toThrow("확인 결과");
    expect(query("select count(*) from pricing_document_versions")).toBe("1");
    query("update price_fixture set price=1200 where product_id=" + literal(productId));
    const published = await publishDocumentExtension(company, input);
    expect((await publishDocumentExtension(company, input)).id).toBe(published.id);
    expect(published.content.lines[1].visible).toBe(false);
    expect(query("select count(*) from pricing_document_extension_publishes")).toBe("1");
    expect(query("select resolve_pricing_document_link_head_v1(" + literal(shareId) + ")")).toBe(published.id);
    expect(query("select document_version_id from pricing_document_share_links where id=" + literal(shareId))).toBe(originalVersion);
    expect(query("select document_version_id from store_orders")).toBe(originalVersion);
    expect(query("select content#>>'{lines,0,price}' from pricing_document_versions where id=" + literal(originalVersion))).toBe("1000");
    await expect(publishDocumentExtension(company, { ...input, mode: "keep" })).rejects.toThrow("재시도 키");
    const next = await reviewDocumentExtension(company, { id: documentId, expected: saved.revision, mode: "keep", validUntil: "2100-12-31", stage: "start" });
    const nextSaved = (await documentRequest<DocumentDraft>(company, "extension-save", { id: documentId, expected: saved.revision, mode: "keep", content: next.content }, true)).result;
    const bypass = await POST(new NextRequest("https://synthetic.test/api/pricing-documents", { method: "POST", headers: { origin: "https://synthetic.test" },
      body: JSON.stringify({ action: "publish", id: documentId, expected: nextSaved.revision }) }));
    const observed = { ordinaryPublishStatus: bypass.status, versions: Number(query("select count(*) from pricing_document_versions")),
      extensionReceipts: Number(query("select count(*) from pricing_document_extension_publishes")) };
    await mkdir("test-results/readonly-pg17/cx121-api", { recursive: true });
    await writeFile("test-results/readonly-pg17/cx121-api/result.json", JSON.stringify(observed, null, 2));
    expect(observed, "ordinary publish must not create a version without the extension review token").toMatchObject({ ordinaryPublishStatus: 409, versions: 2, extensionReceipts: 1 });
  }, 30000);
});
