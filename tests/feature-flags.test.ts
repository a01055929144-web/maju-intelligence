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

  it("prefers a global feature switch over a company allowlist", () => {
    process.env.FEATURE_PRODUCT_IMPORT_TARGETS_COMPANY_IDS = "company-a";
    expect(isFeatureEnabled("PRODUCT_IMPORT_TARGETS", "company-b")).toBe(false);
    process.env.FEATURE_PRODUCT_IMPORT_TARGETS = "true";
    expect(isFeatureEnabled("PRODUCT_IMPORT_TARGETS", "company-b")).toBe(true);
    expect(isFeatureEnabled("PRODUCT_IMPORT_TARGETS")).toBe(true);
  });

  it("preserves existing global import switches while allowing a company rollout", () => {
    process.env.IMPORT_ROW_EDITOR_ENABLED = "true";
    expect(isFeatureEnabled("IMPORT_ROW_EDITOR", "company-b")).toBe(true);
    delete process.env.IMPORT_ROW_EDITOR_ENABLED;
    process.env.FEATURE_IMPORT_ROW_EDITOR_COMPANY_IDS = "company-a";
    expect(isFeatureEnabled("IMPORT_ROW_EDITOR", "company-a")).toBe(true);
    expect(isFeatureEnabled("IMPORT_ROW_EDITOR", "company-b")).toBe(false);
  });

  it("keeps login global-only until a company can be identified before authentication", () => {
    process.env.FEATURE_ACCOUNT_LOGIN_V2_COMPANY_IDS = "company-a";
    expect(isFeatureEnabled("ACCOUNT_LOGIN_V2", "company-a")).toBe(false);
    process.env.ACCOUNT_LOGIN_V2_ENABLED = "true";
    expect(isFeatureEnabled("ACCOUNT_LOGIN_V2", "company-a")).toBe(true);
  });

  it("keeps store costs off until a company is explicitly allowed", () => {
    expect(isFeatureEnabled("STORE_COSTS", "company-a")).toBe(false);
    process.env.FEATURE_STORE_COSTS_COMPANY_IDS = "company-a";
    expect(isFeatureEnabled("STORE_COSTS", "company-a")).toBe(true);
    expect(isFeatureEnabled("STORE_COSTS", "company-b")).toBe(false);
  });

  it("keeps Stage D order IDs off until a company is explicitly allowed", () => {
    expect(isFeatureEnabled("STAGE_D_ORDER_IDS", "company-a")).toBe(false);
    process.env.FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS = "company-a";
    expect(isFeatureEnabled("STAGE_D_ORDER_IDS", "company-a")).toBe(true);
    expect(isFeatureEnabled("STAGE_D_ORDER_IDS", "company-b")).toBe(false);
  });
});
