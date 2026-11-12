import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("map distributor toggle (CC-21)", () => {
  const map = readFileSync("components/sales-route-map-workspace.tsx", "utf8");
  const page = readFileSync("app/dashboard/page.tsx", "utf8");
  it("the server tells the map up front, so the toggle shows before any lead list loads", () => {
    expect(page).toContain('distributorSales={isFeatureEnabled("DISTRIBUTOR_SALES", companyId)}');
    expect(map).toContain("useState(distributorSales)");
  });
  it("the toggle is in the top bar, not only inside the filter popover", () => {
    expect(map.match(/aria-label="영업 대상"/g)?.length).toBe(1);
    expect(map.indexOf('aria-label="영업 대상"')).toBeLessThan(map.indexOf('mapFilterPop === "stage"'));
  });
});
