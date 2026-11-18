import { afterEach, expect, it, vi } from "vitest";
import { reviewDocumentExtension, publishDocumentExtension } from "../lib/pricing/document-extension-client";
import { documentExtensionEnabled } from "../lib/pricing/document-extension-feature";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("defaults OFF and requires both flag and verified company allowlist", () => {
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "");
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_COMPANY_IDS", "a");
  expect(documentExtensionEnabled("a")).toBe(false);
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "true");
  expect(documentExtensionEnabled("a")).toBe(true);
  expect(documentExtensionEnabled("b")).toBe(false);
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
    .mockResolvedValueOnce(Response.json({ result: { version: 2 } }));
  vi.stubGlobal("fetch", fetch);
  const input = { id: "document", expected: 2, mode: "keep" as const, token: "server-bound-token", idempotencyKey: "same-key" };
  await expect(publishDocumentExtension("company", input)).rejects.toThrow("같은 요청");
  await expect(publishDocumentExtension("company", input)).resolves.toMatchObject({ version: 2 });
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
});
