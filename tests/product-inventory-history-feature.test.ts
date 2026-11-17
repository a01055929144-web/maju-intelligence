import { afterEach, describe, expect, it, vi } from "vitest";
import { productInventoryHistoryEnabled } from "../lib/product-inventory-history-feature";

afterEach(() => vi.unstubAllEnvs());

describe("productInventoryHistoryEnabled", () => {
  it("is off by default and only enables allowlisted companies", () => {
    expect(productInventoryHistoryEnabled("company-a")).toBe(false);
    vi.stubEnv("FEATURE_PRODUCT_INVENTORY_HISTORY_COMPANY_IDS", "company-a, company-b");
    expect(productInventoryHistoryEnabled("company-a")).toBe(true);
    expect(productInventoryHistoryEnabled("company-c")).toBe(false);
    expect(productInventoryHistoryEnabled(null)).toBe(false);
  });
});
