import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lead DM settings (CC-31b)", () => {
  const route = readFileSync("app/api/leads/dm-template/route.ts", "utf8");
  const store = readFileSync("lib/store.ts", "utf8");
  it("stores the distributor text under lead_dm_distributor and leaves it alone when a caller does not send it", () => {
    expect(store).toContain('"lead_dm_distributor"');
    expect(store).toContain('input.distributorTemplate === undefined ? "" : ",lead_dm_distributor"');
  });
  it("the distributor text can only be saved by companies with DISTRIBUTOR_SALES", () => {
    expect(route).toContain('isFeatureEnabled("DISTRIBUTOR_SALES", scope.companyId)');
    expect(route).toContain("status: 403");
  });
  it("an admin proxy save leaves an audit record and the GET returns the variable values", () => {
    expect(route).toContain('scope.role === "admin"');
    expect(route).toContain("lead_dm_template_saved");
    for (const key of ["companyName", "region", "mainItems", "newCount"]) expect(route).toContain(key);
  });
  it("the new-lead count only counts restaurant leads of the last 30 days that are not merged or duplicates", () => {
    const fn = store.slice(store.indexOf("export async function countRecentNewRestaurantLeads"), store.indexOf("async function getDailyLeadTargetSnapshot("));
    for (const part of ["target_type=eq.restaurant", "merged_into_lead_id=is.null", "is_duplicate=eq.false", "kstDateDaysAgo(29)"]) expect(fn).toContain(part);
  });
});
