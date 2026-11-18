import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_DISPLAY, documentOutput, lineFromCatalog, parseDocument, type DocumentContent, type DocumentVersion } from "../domains/pricing/document";
import { publicDocumentOutput } from "../domains/pricing/document-share";
import { buildInfoCandidates, PricingInfoPanel } from "../components/pricing-info-panel";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: () => ({ url: "https://synthetic.test", serviceRoleKey: "synthetic-test-only" }) }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";

const company = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const scope = { companyId: company, actor: "a".repeat(64), manager: true };
const marker = "PRIVATE-DOCUMENT-INFO-CANARY";
const safe = { key: "delivery_time_window", label: "배송 시간", value: "04:00~08:00", place: "footer" as const };
const privateKeys = ["settlement_account", "settlement_bank", "settlement_account_number", "settlement_account_holder", " SETTLEMENT_ACCOUNT "];
function content(): DocumentContent {
  return { kind: "sheet", title: "합성 공개 문서", companyName: "합성 회사", contact: "", recipient: "", footer: "",
    validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { ...DEFAULT_DISPLAY, info: [safe, ...privateKeys.map(key => ({ key, label: "비공개 정보", value: marker, place: "footer" as const }))] },
    lines: [lineFromCatalog({ id, name: "합성 품목", displayName: "합성 품목", brand: "", spec: "1L", unit: "통", price: 1200, taxType: "exempt" })] };
}
function version(): DocumentVersion { return { id, documentId: id, version: 1, revision: 1, publishedAt: "2026-11-18T00:00:00Z", unavailablePromotions: [], content: content() }; }

beforeEach(() => mocks.db.mockReset());
afterEach(() => vi.unstubAllGlobals());

it("removes structured bank details on save, old publication output and public output, preserving other document info", () => {
  expect(parseDocument(content()).display?.info).toEqual([safe]);
  expect(documentOutput(version()).display.info).toEqual([safe]);
  expect(JSON.stringify(publicDocumentOutput(version()))).not.toContain(marker);
  const candidates = buildInfoCandidates({ values: { delivery_time_window: safe.value, settlement_bank: marker, settlement_account_number: marker, settlement_account_holder: marker } });
  expect(candidates.some(candidate => candidate.key.startsWith("settlement_"))).toBe(false);
  expect(candidates.find(candidate => candidate.key === safe.key)?.value).toBe(safe.value);
});

it.each(privateKeys)("blocks an old saved draft containing %s before publication, without rewriting it", async key => {
  mocks.db.mockResolvedValue([{ content: { ...content(), display: { ...DEFAULT_DISPLAY, info: [{ key, label: "비공개 정보", value: marker, place: "footer" }] } } }]);
  await expect(pricingDocumentsRepository.request(scope, "publish", { id, expected: 1 })).rejects.toMatchObject({ status: 400 });
  expect(mocks.db).toHaveBeenCalledTimes(1);
  const path = new URL(mocks.db.mock.calls[0][0], "https://synthetic.test");
  expect(path.searchParams.get("company_id")).toBe(`eq.${company}`);
  expect(path.searchParams.get("or")).toBe(`(kind.eq.sheet,owner_key.eq.${scope.actor})`);
});

it("does not render old selected bank rows in the document info editor, preserving other rows", () => {
  const html = renderToStaticMarkup(createElement(PricingInfoPanel, { companyId: company, content: content(), editable: false, onContent: () => undefined }));
  expect(html).not.toContain(marker);
  expect(html).toContain(safe.value);
});

it("publishes cleaned drafts through the original revision-checked RPC with unchanged payload", async () => {
  mocks.db.mockResolvedValueOnce([{ content: parseDocument(content()) }]).mockResolvedValueOnce({ id, version: 2 });
  await expect(pricingDocumentsRepository.request(scope, "publish", { id, expected: 3 })).resolves.toEqual({ id, version: 2 });
  expect(mocks.db).toHaveBeenLastCalledWith("rpc/pricing_p1", expect.objectContaining({ method: "POST", body: JSON.stringify({ p_company: company, p_actor: scope.actor, p_manager: true, p_action: "publish", p_payload: { id, expected: 3 } }) }));
});

it("does not return legacy bank fields from the published-version API, keeping other fields", async () => {
  const row = { id, document_id: id, version: 1, revision: 1, published_at: "2026-11-18T00:00:00Z", content: content() };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ id }]))).mockResolvedValueOnce(new Response(JSON.stringify([row]))));
  const result = await pricingDocumentsRepository.request<DocumentVersion[]>(scope, "versions", { id });
  expect(result[0].content.display?.info).toEqual([safe]);
  expect(result[0].content.lines).toEqual(row.content.lines);
  expect(JSON.stringify(result)).not.toContain(marker);
});
