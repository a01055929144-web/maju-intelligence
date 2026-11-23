import { afterEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
import { readStoreProductCutoffs } from "../lib/pricing/store-product-cutoff";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("stays off unless the company is enabled and hides a missing optional schema", async () => {
  expect(await readStoreProductCutoffs("company-a", ["product-a"])).toEqual(new Map());
  expect(db).not.toHaveBeenCalled();
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_ENABLED", "true");
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS", "company-a");
  db.mockRejectedValueOnce(new Error("42703: column order_cutoff_time does not exist"));
  expect(await readStoreProductCutoffs("company-a", ["product-a"])).toEqual(new Map());
});

it("returns only complete product cutoff pairs for an enabled company", async () => {
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_ENABLED", "true");
  vi.stubEnv("STORE_ORDER_CUTOFF_GUIDANCE_COMPANY_IDS", "company-a");
  db.mockResolvedValue([
    { id: "product-a", order_cutoff_days_before: 2, order_cutoff_time: "18:30:00" },
    { id: "product-b", order_cutoff_days_before: null, order_cutoff_time: null },
  ]);
  expect(await readStoreProductCutoffs("company-a", ["product-a", "product-b"])).toEqual(new Map([
    ["product-a", { cutoffDaysBefore: 2, cutoffTime: "18:30" }],
  ]));
});
