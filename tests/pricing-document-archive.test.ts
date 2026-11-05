import { afterEach, expect, it, vi } from "vitest";
import { pricingDocuments } from "../application/pricing/documents";
import { documentArchiveEnabled } from "../lib/pricing/document-archive";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: () => ({ url: "https://synthetic.test", serviceRoleKey: "synthetic" }) }));
vi.mock("../lib/pricing/document-recalculation", () => ({ withDocumentRecalculations: async (_: unknown, value: unknown) => value }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
const scope = { companyId: "company", actor: "verified", manager: false };
const id = "10000000-0000-4000-8000-000000000001";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("keeps archive default OFF and rejects writes before repository access", () => {
  vi.stubEnv("PRICING_DOCUMENT_ARCHIVE_ENABLED", "");
  expect(documentArchiveEnabled()).toBe(false);
  const request = vi.fn(), service = pricingDocuments({ request });
  expect(() => service.execute(scope, { action: "archive", id, expected: 1, archived: true })).toThrow();
  expect(() => service.execute({ ...scope, archiveEnabled: true }, { action: "archive", id, expected: 1, archived: "true" })).toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("passes only validated archive data and verified scope", async () => {
  const request = vi.fn(), enabled = { ...scope, archiveEnabled: true };
  await pricingDocuments({ request }).execute(enabled, { action: "archive", id, expected: 2, archived: false, companyId: "forged", manager: true });
  expect(request).toHaveBeenCalledWith(enabled, "archive", { id, expected: 2, archived: false });
  await pricingDocumentsRepository.request(enabled, "archive", { id, expected: 2, archived: false });
  expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toEqual({ p_company: "company", p_actor: "verified", p_manager: false, p_document: id, p_expected: 2, p_archived: false });
});
it("does not reference unapplied columns when OFF; filters active and archived lists when ON", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response("[]", { headers: { "content-range": "*/0" } }));
  vi.stubGlobal("fetch", fetch);
  for (const [enabled, archived] of [[false, false], [true, false], [true, true]]) {
    await pricingDocumentsRepository.request({ ...scope, archiveEnabled: enabled }, "list", { archived });
    const url = new URL(fetch.mock.calls.at(-1)![0]);
    expect(url.searchParams.get("company_id")).toBe("eq.company");
    expect(url.searchParams.get("archived_at")).toBe(!enabled ? null : archived ? "not.is.null" : "is.null");
    expect(url.searchParams.get("select")!.includes("archived_at")).toBe(enabled);
  }
});
