import { afterEach, describe, expect, it, vi } from "vitest";
import { isStorePriceVisibilityEnabled } from "../lib/store/07-store-price-visibility-feature";

describe("CX-122 feature boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires both the global switch and the company allowlist", () => {
    vi.stubEnv("STORE_PRICE_VISIBILITY_ENABLED", "true");
    vi.stubEnv("FEATURE_STORE_PRICE_VISIBILITY_COMPANY_IDS", "company-a");
    expect(isStorePriceVisibilityEnabled("company-a")).toBe(true);
    expect(isStorePriceVisibilityEnabled("company-b")).toBe(false);
    vi.stubEnv("STORE_PRICE_VISIBILITY_ENABLED", "false");
    expect(isStorePriceVisibilityEnabled("company-a")).toBe(false);
  });
});
