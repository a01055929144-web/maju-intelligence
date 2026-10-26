import { describe, expect, it } from "vitest";

import { areHoldModulesEnabled, areStructuredFieldRecordsEnabled, CORE_LEADS_HREF, isHoldModulePath, resolveLegacyDashboardHref } from "../lib/feature-modules";

describe("hold feature modules", () => {
  it("is hidden by default and enabled only for an allow-listed company", () => {
    expect(areHoldModulesEnabled("company-a", "")).toBe(false);
    expect(areHoldModulesEnabled("company-a", "company-b, company-a")).toBe(true);
  });

  it("keeps structured field records off until a company is explicitly enabled", () => {
    expect(areStructuredFieldRecordsEnabled("company-a", "")).toBe(false);
    expect(areStructuredFieldRecordsEnabled("company-a", "company-b, company-a")).toBe(true);
    expect(areStructuredFieldRecordsEnabled(undefined, "company-a")).toBe(false);
  });

  it("routes legacy dashboard URLs to separated map and lead pages", () => {
    expect(resolveLegacyDashboardHref({})).toBe("/map");
    expect(resolveLegacyDashboardHref({ view: "leads", leadType: "permit" })).toBe("/leads?type=permit");
    expect(resolveLegacyDashboardHref({ view: "leads", leadType: "keyword", companyId: "company 1" })).toBe("/leads?type=keyword&companyId=company%201");
    expect(resolveLegacyDashboardHref({ view: "history" })).toBe("/map?view=history");
  });

  it("redirects held pages but preserves core contact records and public quotes", () => {
    expect(isHoldModulePath("/revenue/pipeline")).toBe(true);
    expect(isHoldModulePath("/operations/inventory")).toBe(true);
    expect(isHoldModulePath("/revenue/contacts")).toBe(false);
    expect(isHoldModulePath("/settings/billing")).toBe(false);
    expect(isHoldModulePath("/quote/public-token")).toBe(false);
    expect(CORE_LEADS_HREF).toBe("/leads?type=permit");
  });
});
