import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

const prior = { ...process.env };
afterEach(() => { process.env = { ...prior }; });

describe("company pricing gates", () => {
  it("requires both the deployment switch and an exact company ID", () => {
    process.env.FEATURE_PRICING_COMPANY_IDS = "company-a,company-b";
    expect(isFeatureEnabled("PRICING", "company-a")).toBe(false);
    process.env.PRICE_SHEETS_ENABLED = "true";
    expect(isFeatureEnabled("PRICING", "company-a")).toBe(true);
    expect(isFeatureEnabled("PRICING", "company-c")).toBe(false);
  });

  it("keeps ordering off without its public link prerequisites", () => {
    process.env.FEATURE_STORE_ORDERING_COMPANY_IDS = "company-a";
    process.env.STORE_ORDERING_ENABLED = "true";
    expect(isFeatureEnabled("STORE_ORDERING", "company-a")).toBe(false);
    process.env.PRICE_SHEETS_ENABLED = "true";
    process.env.STORE_LINK_SECRET = "a".repeat(32);
    process.env.STORE_PUBLIC_BASE_URL = "https://example.com";
    expect(isFeatureEnabled("STORE_ORDERING", "company-a")).toBe(true);
    expect(isFeatureEnabled("STORE_ORDERING", "company-b")).toBe(false);
  });
});
