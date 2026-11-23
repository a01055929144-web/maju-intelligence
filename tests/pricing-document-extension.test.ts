import { afterEach, expect, it, vi } from "vitest";
import { reviewDocumentExtension, publishDocumentExtension, readDocumentExtensionCatalog, readDocumentExtensionPolicy } from "../lib/pricing/document-extension-client";
import { documentExtensionEnabled } from "../lib/pricing/document-extension-feature";
import { documentRequestError } from "../lib/pricing/document-request-error";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("defaults OFF and requires both flag and verified company allowlist", () => {
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "");
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_COMPANY_IDS", "a");
  expect(documentExtensionEnabled("a")).toBe(false);
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "true");
  expect(documentExtensionEnabled("a")).toBe(true);
  expect(documentExtensionEnabled("b")).toBe(false);
});

it("explains that a company-common sheet can only keep published products and prices", () => {
  const error = new Error('Supabase request failed: 400 {"code":"P0001","message":"extension_common_new_price_required"}');
  expect(documentRequestError(error, true)).toMatchObject({ status: 400, code: "extension_common_new_price_required",
    message: expect.stringContaining("기존 품목과 가격 그대로") });
});

it("accepts only an explicit server extension policy", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { customerLinked: false,
    allowedModes: ["keep"], canAddProducts: false, reason: "company_common_keep_only" } })));
  await expect(readDocumentExtensionPolicy("company", "document")).resolves.toMatchObject({ allowedModes: ["keep"], canAddProducts: false });
});

it("never falls back to old catalog or ordinary publish on unavailable server contract", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ message: "최신 가격 계약 준비 중" }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(reviewDocumentExtension("company", { id: "document", expected: 2, mode: "latest", stage: "start", validUntil: "2099-01-01" })).rejects.toThrow("계약 준비 중");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).action).toBe("extension-review");
});

it("rejects another document's server quote before using any price", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { documentId: "other", revision: 2, mode: "latest", token: "token" } })));
  await expect(reviewDocumentExtension("company", { id: "document", expected: 2, mode: "latest", stage: "start", validUntil: "2099-01-01" })).rejects.toThrow("응답");
});

it("retries a failed extension publication with the identical token, revision and key", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("gateway", { status: 502 }))
    .mockResolvedValueOnce(Response.json({ result: { documentId: "document", version: 2 } }));
  vi.stubGlobal("fetch", fetch);
  const input = { id: "document", expected: 2, mode: "keep" as const, token: "server-bound-token", idempotencyKey: "same-key" };
  await expect(publishDocumentExtension("company", input)).rejects.toThrow("같은 요청");
  await expect(publishDocumentExtension("company", input)).resolves.toMatchObject({ version: 2 });
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
});

it("rejects a publication result for another document", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { documentId: "other", version: 2 } })));
  await expect(publishDocumentExtension("company", { id: "document", expected: 2, mode: "keep", token: "token", idempotencyKey: "same-key" })).rejects.toThrow("게시본");
});

it("uses lookup IDs only and posts mode and revision to the extension price contract", async () => {
  const id = "30000000-0000-4000-8000-000000000001";
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ result: { items: [{ id, price: 9999, cost: 800 }], total: 1 } }))
    .mockResolvedValueOnce(Response.json({ result: { items: [{ id, name: "합성", displayName: "합성", brand: "", spec: "1kg", unit: "봉", price: 1200, taxType: "exempt", source: "base" }] } }));
  vi.stubGlobal("fetch", fetch);
  const result = await readDocumentExtensionCatalog("company", { id: "document", expected: 2, mode: "latest" }, { search: "합성", page: 1 });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "extension-catalog", id: "document", expected: 2, mode: "latest", productIds: [id] });
  expect(fetch.mock.calls[1][1].method).toBe("POST");
  expect(result.items[0].price).toBe(1200);
  expect(result.items[0]).not.toHaveProperty("cost");
});

it("never returns lookup prices when the extension catalog POST fails", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ result: { items: [{ id: "product", price: 9999 }], total: 1 } }))
    .mockResolvedValueOnce(Response.json({ message: "연장 가격 조회 실패" }, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(readDocumentExtensionCatalog("company", { id: "document", expected: 2, mode: "keep" }, { search: "합성" })).rejects.toThrow("연장 가격 조회 실패");
  expect(fetch).toHaveBeenCalledTimes(2);
});
