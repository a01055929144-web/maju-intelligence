import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: request }));
import { purchaseCostRepository } from "../lib/pricing/purchase-cost-repository";

const productId = "11111111-1111-4111-8111-111111111111";
const supplierProductId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => request.mockReset());

it("lists only confirmed same-unit or confirmed-conversion changes and breaks equal-cost ties by supplier product id", async () => {
  request.mockImplementation(async (path: string) => {
    if (!path) return [];
    expect(path).toContain("company_id=eq.company");
    if (path.startsWith("product_catalog?")) return [{ id: productId, product_code: "P1", canonical_name: "상품", sales_unit: "EA", purchase_price: 100 }];
    if (path.startsWith("supplier_product_matches?")) {
      expect(path).toContain("match_status=in.(auto,confirmed)");
      return [
      { product_catalog_id: productId, supplier_product_id: "b", match_status: "confirmed", purchase_to_sales_ratio: null, conversion_confirmed: false },
      { product_catalog_id: productId, supplier_product_id: "a", match_status: "confirmed", purchase_to_sales_ratio: 10, conversion_confirmed: true },
      { product_catalog_id: productId, supplier_product_id: "zero", match_status: "confirmed", purchase_to_sales_ratio: null, conversion_confirmed: false },
      { product_catalog_id: productId, supplier_product_id: "ignored", match_status: "confirmed", purchase_to_sales_ratio: 5, conversion_confirmed: false }
      ];
    }
    if (path.startsWith("supplier_products?")) return [
      { id: "b", supplier_id: "s2", raw_name: "상품", raw_unit: "EA", latest_cost: 120, cost_confirmed: true },
      { id: "a", supplier_id: "s1", raw_name: "상품", raw_unit: "BOX", latest_cost: 1200, cost_confirmed: true },
      { id: "zero", supplier_id: "s1", raw_name: "상품", raw_unit: "EA", latest_cost: 0, cost_confirmed: true },
      { id: "ignored", supplier_id: "s3", raw_name: "상품", raw_unit: "BOX", latest_cost: 50, cost_confirmed: true }
    ];
    if (path.startsWith("product_suppliers?")) return [{ id: "s1", name: "가 매입처" }, { id: "s2", name: "나 매입처" }, { id: "s3", name: "미확정 환산" }];
    return [];
  });

  const result = await purchaseCostRepository.list("company") as { changes: Array<Record<string, unknown>> };
  expect(result.changes).toEqual([{ productId, supplierProductId: "a", supplierName: "가 매입처", cost: 120, direction: "increase" }]);
});

it("restores both cost rows when the supplier history write fails", async () => {
  request.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (!path) return [];
    if (path.startsWith("product_catalog?select") || path.includes("&select=id,purchase_price")) return [{ id: productId, purchase_price: 100, sales_unit: "EA" }];
    if (path.startsWith("supplier_product_matches?")) return [{ id: "match" }];
    if (path.startsWith("supplier_products?select")) return [{ id: supplierProductId, supplier_id: "supplier", raw_unit: "EA", latest_cost: 100, cost_confirmed: true, last_seen_date: "2026-11-01" }];
    if (path.startsWith("product_catalog_imports?select")) return [{ id: "import" }];
    if (path === "supplier_product_cost_history" && init?.method === "POST") throw new Error("history rejected");
    if (init?.method === "PATCH" && init.headers) return [{}];
    return [];
  });
  await expect(purchaseCostRepository.save("company", "owner", { productId, supplierProductId, expectedCost: 100, cost: 120 })).rejects.toThrow("변경 전 값으로 복구");
  const patches = request.mock.calls.filter(([, init]) => init?.method === "PATCH");
  expect(patches.some(([path, init]) => path.startsWith("product_catalog?") && JSON.parse(init.body).purchase_price === 100)).toBe(true);
  expect(patches.some(([path, init]) => path.startsWith("supplier_products?") && JSON.parse(init.body).latest_cost === 100)).toBe(true);
  expect(patches.some(([path, init]) => path.startsWith("product_catalog_imports?") && JSON.parse(init.body).status === "failed")).toBe(true);
});

it("writes supplier-unit cost and reads the same base-unit cost for a confirmed 20:1 conversion", async () => {
  let productCost = 100;
  let supplierCost = 2000;
  const history: number[] = [];
  request.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (!path) return [];
    if (path.startsWith("product_catalog?")) {
      if (init?.method === "PATCH") { productCost = JSON.parse(init.body!).purchase_price; return [{}]; }
      return [{ id: productId, product_code: "ERP-1", canonical_name: "상자 상품", sales_unit: "EA", purchase_price: productCost }];
    }
    if (path.startsWith("supplier_product_matches?")) return [{ id: "match", product_catalog_id: productId, supplier_product_id: supplierProductId, match_status: "confirmed", purchase_to_sales_ratio: 20, conversion_confirmed: true }];
    if (path.startsWith("supplier_products?")) {
      if (init?.method === "PATCH") { supplierCost = JSON.parse(init.body!).latest_cost; return [{}]; }
      return [{ id: supplierProductId, supplier_id: "supplier", raw_name: "상자 상품", raw_unit: "BOX", latest_cost: supplierCost, cost_confirmed: true }];
    }
    if (path.startsWith("product_suppliers?")) return [{ id: "supplier", name: "매입처" }];
    if (path.startsWith("product_catalog_imports?select")) return [{ id: "import" }];
    if (path === "supplier_product_cost_history") { history.push(JSON.parse(init!.body!).purchase_price); return []; }
    return [];
  });

  await purchaseCostRepository.save("company", "owner", { productId, supplierProductId, expectedCost: 100, cost: 120 });
  expect(productCost).toBe(120);
  expect(supplierCost).toBe(2400);
  expect(history).toEqual([2400]);
  const result = await purchaseCostRepository.list("company") as { changes: unknown[] };
  expect(result.changes).toEqual([]);
});
