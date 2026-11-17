import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled } from "@/lib/feature-flags";

describe("PARTNER_PAYMENTS company rollout", () => {
  afterEach(() => {
    delete process.env.FEATURE_PARTNER_PAYMENTS;
    delete process.env.FEATURE_PARTNER_PAYMENTS_COMPANY_IDS;
  });

  it("is off by default and requires the company allowlist", () => {
    expect(isFeatureEnabled("PARTNER_PAYMENTS", "company-1")).toBe(false);
    process.env.FEATURE_PARTNER_PAYMENTS_COMPANY_IDS = "company-2";
    expect(isFeatureEnabled("PARTNER_PAYMENTS", "company-1")).toBe(false);
    expect(isFeatureEnabled("PARTNER_PAYMENTS", "company-2")).toBe(true);
  });
});
