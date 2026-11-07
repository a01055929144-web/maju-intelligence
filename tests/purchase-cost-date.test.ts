import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildPurchaseSheet, parsePurchaseLines, suggestPurchaseMapping } from "../domains/pricing/purchase-import";
import { buildPurchaseDateRows, validPurchaseDateRows } from "../domains/pricing/purchase-cost-date";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), manage: vi.fn(), feature: vi.fn(), legacy: vi.fn(), legacySave: vi.fn(), legacyRestore: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: mocks.manage }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/application/pricing/update-purchase-cost", () => ({ updatePurchaseCosts: () => ({ save: mocks.legacy }) }));
vi.mock("@/lib/pricing/purchase-cost-repository", () => ({ purchaseCostRepository: {} }));
vi.mock("@/lib/pricing/purchase-cost-batch", () => ({
  latestPurchaseCostBatch: vi.fn(), purchaseCostBatchEnabled: () => true, purchaseCostBatchError: () => "실패",
  restorePurchaseCostBatch: mocks.legacyRestore, savePurchaseCostBatch: mocks.legacySave,
  validPurchaseCostBatchValue: (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
}));
import { POST as legacyPOST } from "../app/api/price-sheets/costs/route";
import { GET, POST } from "../app/api/price-sheets/costs/date-batches/route";
const companyId = "00000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";
const productId = (index: number) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
function fixture(count = 3417, products = 745) {
  const source = Array.from({ length: count }, (_, index) => [`ERP-${index % products + 1}`, `합성 상품 ${index % products + 1}`, "봉", "2026-11-07", 300, index + 1, (index + 1) * 300, (index + 1) * 30, (index + 1) * 330]);
  const sheet = buildPurchaseSheet([["ERP 코드", "품목", "단위", "구매일", "단가", "수량", "공급가액", "부가세", "합계"], ...source]);
  return parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "excluded").lines.map((line, index) => ({ ...line, productId: productId(index % products) }));
}
const url = `https://example.test/api/price-sheets/costs/date-batches?companyId=${companyId}`;
const post = (body: unknown, origin?: string) => POST(new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: origin ? { origin } : {} }));
const payload = () => ({ action: "save", companyId, batchId, receiptDate: "2026-11-07", fileName: "합성.csv", rows: buildPurchaseDateRows(fixture(1, 1), [2], []) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", undefined);
  mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { name: "대표", workspaceRole: "owner" } });
  mocks.manage.mockReturnValue(true); mocks.feature.mockReturnValue(true);
  mocks.db.mockImplementation(async (path: string) => path.includes("purchase_price_date=is.null") ? [] : path.startsWith("product_catalog?") ? [{ id: productId(0), sales_unit: "봉" }] : { batchId, recalcRunId: null, status: "completed", rowCount: 1, historyOnlyProductCount: 0 });
});
afterEach(() => vi.unstubAllEnvs());
it("passes 3417 original transactions and amounts to one RPC with 745 price selections", async () => {
  const lines = fixture();
  const rows = buildPurchaseDateRows(lines, lines.slice(0, 745).map(line => line.rowNumber), []);
  expect(rows).toHaveLength(3417); expect(rows.filter(row => row.priceSelected)).toHaveLength(745);
  rows.forEach((row, index) => expect(row).toMatchObject({ productId: productId(index % 745), selectedSourceRowNumber: index + 2,
    quantity: index + 1, supplyAmount: (index + 1) * 300, vatAmount: (index + 1) * 30, totalAmount: (index + 1) * 330, rawValues: lines[index].raw }));
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockImplementation(async (path: string, options?: { body: string }) => {
    if (path.startsWith("product_catalog?")) return Array.from({ length: 745 }, (_, index) => ({ id: productId(index), sales_unit: "봉" }));
    const rpc = JSON.parse(options!.body); expect(rpc.p_rows).toEqual(rows); expect(rpc.p_company).toBe(companyId);
    return { batchId, recalcRunId: null, status: "completed", rowCount: 3417, historyOnlyProductCount: 0 };
  });
  const response = await post({ ...payload(), rows });
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ rowCount: 3417, status: "completed" });
  expect(mocks.db.mock.calls.filter(([path]) => path.startsWith("rpc/"))).toHaveLength(1);
  expect(mocks.db.mock.calls.at(-1)?.[0]).toBe("rpc/save_purchase_cost_date_batch_v2");
});
it("requires explicit selection or hold for each of 188 conflicting groups", () => {
  const lines = fixture(376, 188).map((line, index) => ({ ...line, cost: index < 188 ? 150 : 220 }));
  expect(() => buildPurchaseDateRows(lines, [], [])).toThrow();
  const rows = buildPurchaseDateRows(lines, lines.slice(0, 178).map(line => line.rowNumber), lines.slice(178, 188).map(line => line.rowNumber));
  expect(rows).toHaveLength(376); expect(rows.filter(row => row.priceSelected)).toHaveLength(178); expect(rows.filter(row => row.priceHeld)).toHaveLength(10);
  expect(validPurchaseDateRows(rows)).toBe(true);
  expect(() => buildPurchaseDateRows(lines, [2], [2])).toThrow();
  expect(() => buildPurchaseDateRows([{ ...lines[0], productId: undefined }], [2], [])).toThrow();
});
it("defaults OFF before auth, schema reads and save/restore RPCs", async () => {
  expect((await GET(new NextRequest(url))).status).toBe(404);
  expect((await post(payload())).status).toBe(404);
  expect((await post({ action: "restore", companyId, batchId })).status).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
});
it("scopes latest-batch reads and restores only through the single v2 RPC", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockResolvedValueOnce([{ id: batchId, status: "completed", recalc_run_id: null, row_count: 1, history_only_product_count: 0 }]);
  expect(await (await GET(new NextRequest(url))).json()).toMatchObject({ enabled: true, latestBatch: { id: batchId } });
  expect(mocks.db.mock.calls[0][0]).toContain(`company_id=eq.${companyId}`);
  mocks.db.mockResolvedValueOnce({ batchId, status: "restored" });
  expect(await (await post({ action: "restore", companyId, batchId })).json()).toEqual({ batchId, status: "restored" });
  expect(mocks.db.mock.calls.at(-1)?.[0]).toBe("rpc/restore_purchase_cost_date_batch_v2");
});
it("keeps retry batch IDs and never chains a second write after RPC failure", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  const input = payload(); await post(input); await post(input);
  const writes = mocks.db.mock.calls.filter(([path]) => path.startsWith("rpc/")); expect(writes[0]).toEqual(writes[1]);
  mocks.db.mockImplementation(async (path: string) => { if (path.startsWith("product_catalog?")) return [{ id: productId(0), sales_unit: "봉" }]; throw new Error("recalculation failed"); });
  expect((await post(input)).status).toBe(409);
  expect(mocks.db.mock.calls.filter(([path]) => path.startsWith("rpc/"))).toHaveLength(3);
});
it("rejects wrong company, staff, cross-origin and malformed rows before DB access", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.auth.mockResolvedValueOnce({ ok: true, companyId: "other" }); expect((await post(payload())).status).toBe(401);
  mocks.manage.mockReturnValueOnce(false); expect((await post(payload())).status).toBe(403);
  expect((await post(payload(), "https://evil.test")).status).toBe(403);
  const input = payload();
  for (const body of [{ ...input, rows: [...input.rows, ...input.rows] }, { ...input, rows: Array(5001).fill(input.rows[0]) }, { ...input, rows: [{ ...input.rows[0], priceSelected: false }] }, { ...input, receiptDate: "2026-02-30" }, { ...input, rows: [{ ...input.rows[0], companyId: "other" }] }]) expect((await post(body)).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("blocks unresolved unit conversion before the atomic write", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockResolvedValueOnce([{ id: productId(0), sales_unit: "BOX" }]);
  expect((await post(payload())).status).toBe(409);
  expect(mocks.db.mock.calls.some(([path]) => path.startsWith("rpc/"))).toBe(false);
});

it("normalizes equal-price selections to one marker and preserves blank source units", () => {
  const lines = fixture(4, 1).map(line => ({ ...line, unit: "" }));
  const rows = buildPurchaseDateRows(lines, lines.map(line => line.rowNumber), []);
  expect(rows).toHaveLength(4); expect(rows.filter(row => row.priceSelected)).toHaveLength(1);
  expect(rows[0].selectedSourceRowNumber).toBe(2);
  expect(rows.every(row => row.unit === "")).toBe(true);
  expect(validPurchaseDateRows(rows)).toBe(true);
});

it("rejects an oversized raw-value payload before auth or DB access", async () => {
  const rows = buildPurchaseDateRows(fixture(3, 1), [2], []).map(row => ({ ...row, rawValues: Array(200).fill("X".repeat(10000)) }));
  expect((await post({ ...payload(), rows })).status).toBe(413);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
});

it("keeps v1's 100-change limit OFF and blocks all legacy writes during date rollout", async () => {
  const legacy = (body: unknown) => legacyPOST(new NextRequest("https://example.test/api/price-sheets/costs", { method: "POST", body: JSON.stringify(body) }));
  const changes = Array.from({ length: 101 }, () => ({ productId: productId(0), cost: 200, expectedCost: 100 }));
  expect((await legacy({ action: "save-batch", companyId, batchId, changes })).status).toBe(400);
  expect(mocks.legacySave).not.toHaveBeenCalled();
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  for (const body of [{ companyId, changes }, { action: "save-batch", companyId, batchId, changes: changes.slice(0, 1) }, { action: "restore-batch", companyId, batchId }]) expect((await legacy(body)).status).toBe(409);
  expect(mocks.legacy).not.toHaveBeenCalled(); expect(mocks.legacySave).not.toHaveBeenCalled(); expect(mocks.legacyRestore).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
});

it("requires an expected price for an explicit undated-current replacement", () => {
  const row = payload().rows[0];
  expect(validPurchaseDateRows([{ ...row, replaceUndatedCurrent: true }])).toBe(false);
  expect(validPurchaseDateRows([{ ...row, replaceUndatedCurrent: true, expectedPurchasePrice: 100 }])).toBe(true);
  expect(validPurchaseDateRows([{ ...row, priceSelected: false, priceHeld: true, replaceUndatedCurrent: true, expectedPurchasePrice: 100 }])).toBe(false);
});

it("forwards the explicit expected price and reports stale-current cancellation without another write", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("product_catalog?")) return [{ id: productId(0), sales_unit: "봉", purchase_price: 150, purchase_price_date: null }];
    throw new Error("purchase_cost_date_expected_price_changed");
  });
  const input = payload();
  const response = await post({ ...input, rows: [{ ...input.rows[0], replaceUndatedCurrent: true, expectedPurchasePrice: 100 }] });
  expect(response.status).toBe(409); expect((await response.json()).message).toContain("화면 전체를 새로고침");
  const writes = mocks.db.mock.calls.filter(([path]) => path.startsWith("rpc/"));
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body).p_rows[0]).toMatchObject({ replaceUndatedCurrent: true, expectedPurchasePrice: 100 });
});

it("recovers the exact pending batch in company scope even if a newer batch exists", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockResolvedValueOnce([{ id: batchId, status: "completed", recalc_run_id: null, row_count: 2, history_only_product_count: 1 }]);
  const result = await GET(new NextRequest(`${url}&batchId=${batchId}`));
  expect(await result.json()).toMatchObject({ batch: { id: batchId, rowCount: 2, historyOnlyProductCount: 1 } });
  expect(mocks.db).toHaveBeenCalledTimes(1);
  expect(mocks.db.mock.calls[0][0]).toContain(`company_id=eq.${companyId}&id=eq.${batchId}`);
});

it("blocks an unconfirmed multipack price while allowing held receipt history", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  mocks.db.mockResolvedValueOnce([{ id: productId(0), sales_unit: null, purchase_to_sales_ratio: 10 }]);
  const response = await post(payload());
  expect(response.status).toBe(409); expect((await response.json()).message).toContain("환산을 먼저 확인");
  expect(mocks.db.mock.calls.some(([path]) => path.startsWith("rpc/"))).toBe(false);
  mocks.db.mockResolvedValueOnce([{ id: productId(0), sales_unit: null, purchase_to_sales_ratio: 10 }]);
  const input = payload();
  expect((await post({ ...input, rows: [{ ...input.rows[0], priceSelected: false, priceHeld: true }] })).status).toBe(200);
  expect(mocks.db.mock.calls.at(-1)?.[0]).toBe("rpc/save_purchase_cost_date_batch_v2");
});

it("checks browser origin against the request host when the server URL is internal", async () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS", companyId);
  const send = (origin: string) => POST(new NextRequest("http://localhost:3101/api/price-sheets/costs/date-batches", {
    method: "POST", body: JSON.stringify(payload()), headers: { host: "127.0.0.1:3101", origin }
  }));
  expect((await send("http://127.0.0.1:3101")).status).toBe(200);
  const writes = mocks.db.mock.calls.length;
  expect((await send("https://evil.test")).status).toBe(403);
  expect((await send("ftp://127.0.0.1:3101")).status).toBe(403);
  expect(mocks.db).toHaveBeenCalledTimes(writes);
});
