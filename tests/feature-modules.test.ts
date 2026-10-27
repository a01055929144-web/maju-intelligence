import { describe, expect, it } from "vitest";

import { areHoldModulesEnabled, CORE_LEADS_HREF, isHoldModulePath, isMapFilterPersistenceEnabled, resolveLegacyDashboardHref } from "../lib/feature-modules";

describe("hold feature modules", () => {
  it("keeps map filter persistence disabled unless explicitly enabled", () => {
    expect(isMapFilterPersistenceEnabled("")).toBe(false);
    expect(isMapFilterPersistenceEnabled("false")).toBe(false);
    expect(isMapFilterPersistenceEnabled("true")).toBe(true);
    expect(isMapFilterPersistenceEnabled("1")).toBe(true);
  });

  it("is hidden by default and enabled only for an allow-listed company", () => {
    expect(areHoldModulesEnabled("company-a", "")).toBe(false);
    expect(areHoldModulesEnabled("company-a", "company-b, company-a")).toBe(true);
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
