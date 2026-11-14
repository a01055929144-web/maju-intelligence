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
    // M3c: 팝오버 내용은 map-filter-popover.tsx로 옮겨졌다 — 상단 바의 토글이 팝오버 호출보다 앞에 있는지로 같은 뜻을 확인한다.
    expect(map.indexOf('aria-label="영업 대상"')).toBeLessThan(map.indexOf("<MapFilterPopover"));
  });
});

import { matchesMapLeadType } from "../lib/map-layer-selection";

describe("map distributor lead type filter (CC-21)", () => {
  it("default 'new' filter hides them for stores but not for distributors", () => {
    expect(matchesMapLeadType("sales", "new", false)).toBe(false);
    expect(matchesMapLeadType("sales", "new", true)).toBe(true);
    expect(matchesMapLeadType("sales", "sales", true)).toBe(true);
  });
});
