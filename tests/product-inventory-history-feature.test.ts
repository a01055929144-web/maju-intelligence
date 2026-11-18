import { afterEach, describe, expect, it, vi } from "vitest";
import { productInventoryHistoryEnabled } from "../lib/product-inventory-history-feature";

afterEach(() => vi.unstubAllEnvs());

describe("productInventoryHistoryEnabled", () => {
  it("requires both the global switch and an allowlisted company", () => {
    expect(productInventoryHistoryEnabled("company-a")).toBe(false);
    vi.stubEnv("FEATURE_PRODUCT_INVENTORY_HISTORY_COMPANY_IDS", "company-a, company-b");
    expect(productInventoryHistoryEnabled("company-a")).toBe(false);
    vi.stubEnv("PRODUCT_INVENTORY_HISTORY_ENABLED", "true");
    expect(productInventoryHistoryEnabled("company-a")).toBe(true);
    expect(productInventoryHistoryEnabled("company-c")).toBe(false);
    expect(productInventoryHistoryEnabled(null)).toBe(false);
  });
});
