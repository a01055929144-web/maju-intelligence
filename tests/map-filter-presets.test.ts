import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMapFilterPresetFilters } from "../lib/map-filter-presets";

const routeSource = readFileSync("app/api/map/filter-presets/route.ts", "utf8");
const storeSource = readFileSync("lib/store.ts", "utf8");

describe("map filter presets", () => {
  it("accepts only the supported filter payload", () => {
    expect(parseMapFilterPresetFilters({ excludeClosedStores: true, gradeFilter: "A", industry: "한식", leadType: "sales", reminderOnly: false, stage: "contacted" })).toEqual({
      excludeClosedStores: true, gradeFilter: "A", industry: "한식", leadType: "sales", reminderOnly: false, stage: "contacted"
    });
    expect(parseMapFilterPresetFilters({ gradeFilter: "admin" })).toBeNull();
  });

  it("derives tenant and actor identity only from the verified customer session", () => {
    expect(routeSource).toContain("getCustomerSession()");
    expect(routeSource).toContain("session.companyId");
    expect(routeSource).toContain("`app_user:${session.userId}`");
    expect(routeSource).toContain("`legacy_owner:${session.companyId}`");
    expect(routeSource).toContain('message: "actor_identity_required"');
    expect(routeSource).not.toContain("body?.companyId");
    expect(routeSource).not.toContain("body?.actorKey");
  });

  it("keeps expansion candidates out of automatic collection", () => {
    expect(storeSource).toContain('getCompanyLeadSearchRegions(companyId, "assigned")');
    expect(storeSource).toContain('options.mode === "manual"');
    expect(storeSource).toContain('getCompanyLeadSearchRegions(companyId, "expansion_candidate")');
  });
});
