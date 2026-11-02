import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: request }));
import { purchaseCostRepository } from "../lib/pricing/purchase-cost-repository";

const productId = "11111111-1111-4111-8111-111111111111";
const supplierProductId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => request.mockReset());

it("restores both cost rows when the supplier history write fails", async () => {
  request.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (!path) return [];
    if (path.startsWith("product_catalog?select") || path.includes("&select=id,purchase_price")) return [{ id: productId, purchase_price: 100 }];
    if (path.startsWith("supplier_product_matches?")) return [{ id: "match" }];
    if (path.startsWith("supplier_products?select")) return [{ id: supplierProductId, supplier_id: "supplier", latest_cost: 100, cost_confirmed: true, last_seen_date: "2026-11-01" }];
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
