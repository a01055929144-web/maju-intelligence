import { afterEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: request }));
import { latestPurchaseCostBatch, purchaseCostBatchEnabled, purchaseCostBatchError, restorePurchaseCostBatch, savePurchaseCostBatch, validPurchaseCostBatchValue } from "../lib/pricing/purchase-cost-batch";

afterEach(() => { vi.unstubAllEnvs(); request.mockReset(); });

it("keeps atomic cost saving off until a company is explicitly listed", () => {
  vi.stubEnv("FEATURE_PURCHASE_COST_BATCH_COMPANY_IDS", "");
  expect(purchaseCostBatchEnabled("company-a")).toBe(false);
  vi.stubEnv("FEATURE_PURCHASE_COST_BATCH_COMPANY_IDS", "company-a, company-b");
  expect(purchaseCostBatchEnabled("company-b")).toBe(true);
  expect(purchaseCostBatchEnabled("company-c")).toBe(false);
});

it("accepts the SQL numeric(14,2) boundary and hides unknown database errors", () => {
  expect(validPurchaseCostBatchValue(999_999_999_999.99)).toBe(true);
  expect(validPurchaseCostBatchValue(1_000_000_000_000)).toBe(false);
  expect(validPurchaseCostBatchValue(0.001)).toBe(false);
  expect(purchaseCostBatchError(new Error("Supabase request failed: 400 {\"message\":\"supplier_cost_changed\"}"))).toContain("변경됐습니다");
  expect(purchaseCostBatchError(new Error("secret table internals"))).not.toContain("secret");
});

it("uses one company-scoped batch for save, reload, and restore", async () => {
  request.mockResolvedValueOnce({ batchId: "batch", status: "applied", priceRunId: "run" })
    .mockResolvedValueOnce([{ id: "batch", restored_at: null }])
    .mockResolvedValueOnce({ batchId: "batch", status: "restored" });
  const changes = [{ productId: "product", supplierProductId: "supplier", expectedCost: 100, expectedSupplierCost: 2000, cost: 120 }];
  await savePurchaseCostBatch("company-a", "batch", "owner", changes);
  expect(await latestPurchaseCostBatch("company-a")).toEqual({ id: "batch", restoredAt: null });
  await restorePurchaseCostBatch("company-a", "batch", "owner");
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    "rpc/save_purchase_cost_batch_v1",
    "purchase_cost_batches?select=id,restored_at&company_id=eq.company-a&order=created_at.desc,id.desc&limit=1",
    "rpc/restore_purchase_cost_batch_v1"
  ]);
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ p_company: "company-a", p_batch: "batch", p_changes: changes, p_actor_name: "owner" });
});
