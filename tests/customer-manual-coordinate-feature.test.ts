import { afterEach, describe, expect, it, vi } from "vitest";
import { areManualCustomerCoordinatesEnabled } from "../lib/feature-modules";

afterEach(() => vi.unstubAllEnvs());

describe("manual customer coordinate feature", () => {
  it("requires both the global switch and the company allowlist", () => {
    expect(areManualCustomerCoordinatesEnabled("company-a")).toBe(false);
    vi.stubEnv("CUSTOMER_MANUAL_COORDINATE_ENABLED", "true");
    expect(areManualCustomerCoordinatesEnabled("company-a")).toBe(false);
    vi.stubEnv("CUSTOMER_MANUAL_COORDINATE_ENABLED_COMPANY_IDS", "company-a,company-b");
    expect(areManualCustomerCoordinatesEnabled("company-a")).toBe(true);
    expect(areManualCustomerCoordinatesEnabled("company-c")).toBe(false);
  });
});
