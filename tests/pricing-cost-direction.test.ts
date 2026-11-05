import { afterEach, beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
import { costDirectionEnabled, readCostDirections } from "../lib/pricing/cost-direction";
import { publicCostDirection } from "../domains/pricing/cost-direction";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", ""); });
afterEach(() => vi.unstubAllEnvs());

it("defaults off and never reads purchase data without both gates", async () => {
  expect(costDirectionEnabled()).toBe(false);
  expect((await readCostDirections("company", true, ["product"])).size).toBe(0);
  vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", "true");
  expect((await readCostDirections("company", false, ["product"])).size).toBe(0);
  expect((await readCostDirections("company", true, [])).size).toBe(0);
  expect(db).not.toHaveBeenCalled();
});

it("only accepts an enum for the requested product and sales unit", async () => {
  vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", "true");
  db.mockResolvedValue([
    { product_id: "product", sales_unit: "봉", direction: "up", cost: 1234, margin: 45, supplier: "private" },
    { product_id: "product", sales_unit: "박스", direction: "down" },
    { product_id: "foreign", sales_unit: "봉", direction: "up" },
    { product_id: "product", sales_unit: "개", direction: { cost: 1234, direction: "up" } },
  ]);
  expect(Array.from(await readCostDirections("verified-company", true, ["product"]))).toEqual([["product:봉", "up"], ["product:박스", "down"]]);
  expect(db.mock.calls[0][0]).toBe("rpc/storefront_cost_directions");
  expect(JSON.parse(db.mock.calls[0][1].body)).toEqual({ p_company: "verified-company", p_products: ["product"] });
  for (const value of [null, undefined, "flat", 1234, { direction: "up" }]) expect(publicCostDirection(value)).toBeNull();
});

it("hides missing history and propagates a failed approved projection", async () => {
  vi.stubEnv("STORE_PURCHASE_COST_DIRECTION_ENABLED", "true");
  db.mockResolvedValueOnce([]);
  expect((await readCostDirections("company", true, ["product"])).size).toBe(0);
  db.mockRejectedValueOnce(new Error("projection failed"));
  await expect(readCostDirections("company", true, ["product"])).rejects.toThrow("projection failed");
});
