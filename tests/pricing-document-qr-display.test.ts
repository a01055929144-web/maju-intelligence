import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), contract: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: (...args: unknown[]) => args[0] === "rpc/pricing_document_qr_display_contract_v1" ? mocks.contract(...args) : mocks.request(...args) }));
import { readDocumentQrDisplay, saveDocumentQrDisplay } from "../lib/pricing/document-qr-display";
import { documentQrDisplayEnabled } from "../lib/pricing/feature";
import { documentQrDisplay, parseDisplay, DEFAULT_DISPLAY } from "../domains/pricing/document";
import { pricingDocuments } from "../application/pricing/documents";

const id = "10000000-0000-4000-8000-000000000001";
const scope = { companyId: "20000000-0000-4000-8000-000000000001", actor: "verified-owner", manager: true, qrDisplayEnabled: true };
const settings = { position: "top-right", size: "large" } as const;
const content = { title: "stored snapshot", lines: [{ price: 101, taxType: "taxable", visible: false, promotionId: "old-promotion", priceIncludesTax: true }], display: { ...DEFAULT_DISPLAY, footerBold: true }, legacyMarker: "preserve" };
const row = { id, revision: 7, kind: "sheet", owner_key: scope.actor, content, archived_at: null };
beforeEach(() => { vi.resetAllMocks(); mocks.contract.mockResolvedValue(1); });
afterEach(() => vi.unstubAllEnvs());

it("keeps old document defaults and round-trips only valid QR settings", () => {
  expect(documentQrDisplay(null)).toEqual({ position: "bottom-left", size: "normal" });
  expect(documentQrDisplay({ position: "absolute", size: "9999" })).toEqual({ position: "bottom-left", size: "normal" });
  expect(parseDisplay({ ...DEFAULT_DISPLAY, qr: settings }).qr).toEqual(settings);
  vi.stubEnv("FEATURE_DOCUMENT_QR_DISPLAY_COMPANY_IDS", "");
  expect(documentQrDisplayEnabled(scope.companyId)).toBe(false);
  vi.stubEnv("FEATURE_DOCUMENT_QR_DISPLAY_COMPANY_IDS", ` ${scope.companyId} `);
  expect(documentQrDisplayEnabled(scope.companyId)).toBe(true);
  expect(documentQrDisplayEnabled("other-company")).toBe(false);
  expect(documentQrDisplayEnabled("")).toBe(false);
});
it("rejects OFF and invalid input before repository access", () => {
  const request = vi.fn(), service = pricingDocuments({ request });
  expect(() => service.read({ ...scope, qrDisplayEnabled: false }, "qr-display", { id })).toThrow("사용할 수 없습니다");
  expect(() => service.execute(scope, { action: "save-qr-display", id, expected: 7, settings: { position: "absolute", size: "large" } })).toThrow("위치와 크기");
  expect(() => service.execute(scope, { action: "save-qr-display", id, expected: 0, settings })).toThrow("저장 버전");
  expect(request).not.toHaveBeenCalled();
});
it("reads one company/author-scoped document and returns no stored prices", async () => {
  mocks.request.mockResolvedValue([row]);
  expect(await readDocumentQrDisplay(scope, id)).toEqual({ id, revision: 7, settings: { position: "bottom-left", size: "normal" } });
  expect(mocks.request.mock.calls[0][0]).toContain(`company_id=eq.${scope.companyId}&id=eq.${id}`);
  expect(mocks.request.mock.calls[0][0]).toContain("owner_key.eq.verified-owner");
});
it("changes only stored display.qr under revision CAS, preserving prices, hidden lines and legacy data", async () => {
  const frozen = JSON.stringify(content);
  mocks.request.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id, revision: 8 }]);
  expect(await saveDocumentQrDisplay(scope, { id, expected: 7, settings })).toEqual({ id, previousRevision: 7, revision: 8, settings });
  const [path, options] = mocks.request.mock.calls[1];
  expect(path).toContain("revision=eq.7");
  expect(path).toContain("archived_at=is.null");
  expect(options.method).toBe("PATCH");
  const saved = JSON.parse(options.body);
  expect(saved.content).toEqual({ ...content, display: { ...content.display, qr: settings } });
  expect(saved.revision).toBe(8);
  expect(JSON.stringify(content)).toBe(frozen);
  expect(mocks.request.mock.calls.every(([path]) => path.startsWith("pricing_documents?"))).toBe(true);
});
it.each([
  { ...row, kind: "quote", owner_key: "other-owner" },
  { ...row, archived_at: "2026-11-22T00:00:00Z" },
])("rejects foreign quotes and archived documents without writing", async stored => {
  mocks.request.mockResolvedValue([stored]);
  await expect(saveDocumentQrDisplay(scope, { id, expected: 7, settings })).rejects.toMatchObject({ status: 404 });
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("rejects shared-sheet writes by sales and stale revisions before writing", async () => {
  mocks.request.mockResolvedValue([row]);
  await expect(saveDocumentQrDisplay({ ...scope, manager: false }, { id, expected: 7, settings })).rejects.toMatchObject({ status: 404 });
  await expect(saveDocumentQrDisplay(scope, { id, expected: 6, settings })).rejects.toMatchObject({ status: 409 });
  expect(mocks.request.mock.calls.every(([, options]) => !options)).toBe(true);
});
it("fails closed if another save wins the revision race", async () => {
  mocks.request.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
  await expect(saveDocumentQrDisplay(scope, { id, expected: 7, settings })).rejects.toMatchObject({ status: 409 });
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it("refuses storage when the SQL retention contract is absent or replaced", async () => {
  mocks.contract.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error("missing RPC"));
  await expect(readDocumentQrDisplay(scope, id)).rejects.toMatchObject({ status: 503 });
  await expect(saveDocumentQrDisplay(scope, { id, expected: 7, settings })).rejects.toMatchObject({ status: 503 });
  expect(mocks.request).not.toHaveBeenCalled();
  await expect(readDocumentQrDisplay({ ...scope, qrDisplayEnabled: false }, id)).rejects.toMatchObject({ status: 404 });
  expect(mocks.contract).toHaveBeenCalledTimes(2);
});
