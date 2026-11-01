import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminMapOverview } from "../application/analytics/admin-map-overview";

describe("admin map overview", () => {
  it("keeps the route behind admin auth and the default-off server flag", () => {
    const source = readFileSync("app/admin/map/page.tsx", "utf8");
    const layoutSource = readFileSync("app/admin/layout.tsx", "utf8");
    const shellSource = readFileSync("components/admin-app-shell.tsx", "utf8");
    const mapSource = readFileSync("components/admin-area-kakao-map.tsx", "utf8");
    expect(source).toContain("getAdminSession()");
    expect(source).toContain('redirect("/admin/login")');
    expect(source).toContain("isAdminMapOverviewEnabled()");
    expect(source.indexOf("if (!enabled)")).toBeLessThan(source.lastIndexOf("getManagedCompanyAccounts()"));
    expect(source).not.toMatch(/latitude|longitude|phone/);
    expect(layoutSource).toContain("adminMapEnabled={isAdminMapOverviewEnabled() || isCiLayoutFixturesEnabled()}");
    expect(shellSource).toContain('item.active !== "map"');
    expect(source).toContain('label="고객사 구분"');
    expect(source).not.toContain("DistrictTileSvg");
    expect(mapSource).toContain("KakaoAddressMap");
    expect(mapSource).toContain("markers={[]}");
  });

  it("aggregates only company-scoped counts without exposing store details", () => {
    const result = buildAdminMapOverview([
      {
        companyId: "company-a",
        companyName: "회사 A",
        areaState: { defaultAreas: ["서울특별시 강남구"], effectiveAreas: [], explicitAreas: ["서울특별시 마포구"], source: "explicit", unrecognizedRegions: [] },
        stats: [{ administrativeArea: "서울특별시 강남구", customerCount: 3, recentLeadCount: 2, totalLeadCount: 5 }]
      },
      {
        companyId: "company-b",
        companyName: "회사 B",
        areaState: { defaultAreas: ["서울특별시 강남구"], effectiveAreas: [], explicitAreas: [], source: "default", unrecognizedRegions: [] },
        stats: [{ administrativeArea: "서울특별시 강남구", customerCount: 4, recentLeadCount: 1, totalLeadCount: 6 }]
      }
    ], ["서울특별시 강남구", "서울특별시 마포구"]);

    expect(result.areas[0]).toEqual({ administrativeArea: "서울특별시 강남구", customerCount: 7, recentLeadCount: 3, totalLeadCount: 11, territoryCount: 2, salesCount: 0 });
    expect(result.companies[0].areas[1]?.salesCovered).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/address|latitude|longitude|phone/);
  });
});
