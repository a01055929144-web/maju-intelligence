import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled } from "../lib/feature-flags";

describe("MARGIN_TEMPLATES switch", () => {
  afterEach(() => { delete process.env.FEATURE_MARGIN_TEMPLATES_COMPANY_IDS; delete process.env.MARGIN_TEMPLATES_ENABLED; });
  it("is off by default and on only for listed companies", () => {
    expect(isFeatureEnabled("MARGIN_TEMPLATES", "c1")).toBe(false);
    process.env.FEATURE_MARGIN_TEMPLATES_COMPANY_IDS = "c1, c2";
    expect(isFeatureEnabled("MARGIN_TEMPLATES", "c2")).toBe(true);
    expect(isFeatureEnabled("MARGIN_TEMPLATES", "c3")).toBe(false);
  });
});
