import { describe, expect, it } from "vitest";

import { areHoldModulesEnabled, CORE_LEADS_HREF, isHoldModulePath } from "../lib/feature-modules";

describe("hold feature modules", () => {
  it("is hidden by default and enabled only for an allow-listed company", () => {
    expect(areHoldModulesEnabled("company-a", "")).toBe(false);
    expect(areHoldModulesEnabled("company-a", "company-b, company-a")).toBe(true);
  });

  it("redirects held pages but preserves core contact records and public quotes", () => {
    expect(isHoldModulePath("/revenue/pipeline")).toBe(true);
    expect(isHoldModulePath("/operations/inventory")).toBe(true);
    expect(isHoldModulePath("/revenue/contacts")).toBe(false);
    expect(isHoldModulePath("/quote/public-token")).toBe(false);
    expect(CORE_LEADS_HREF).toContain("leadType=permit");
  });
});
