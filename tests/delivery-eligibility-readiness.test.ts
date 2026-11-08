import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("delivery eligibility readiness", () => {
  it("reproduces the current route input defect separately from the future fix", () => {
    const source = readFileSync("lib/store.ts", "utf8");
    const start = source.indexOf("export async function getTodayRoutePlan");
    const end = source.indexOf("export async function getCompanyOriginAddress", start);
    const routePlan = source.slice(start, end);

    expect(routePlan).toContain("customerMaster.customers");
    expect(routePlan).toContain(".map((customer, index)");
    expect(routePlan).not.toContain("deliveryEligibility");
  });

  it.todo("when the flag is ON, getTodayRoutePlan excludes not_ready and retains eligible manual stops");
  it.todo("when the flag is OFF, getTodayRoutePlan preserves the current stop count, order, driver and vehicle");
  it.todo("an unassigned order from the 02 contract does not change eligibility or create a map stop");
});
