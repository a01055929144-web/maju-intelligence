import { isSalesAreaCovered } from "../../lib/korean-administrative-areas";
import type { CompanySalesAreaMapStat, CompanySalesAreaState } from "../../lib/store";

export type AdminMapView = "territory" | "sales" | "customers" | "leads";

export type AdminMapCompanySnapshot = {
  companyId: string;
  companyName: string;
  areaState: CompanySalesAreaState;
  stats: CompanySalesAreaMapStat[];
};

export function buildAdminMapOverview(snapshots: readonly AdminMapCompanySnapshot[], areas: readonly string[]) {
  const rows = snapshots.map((snapshot) => {
    const stats = new Map(snapshot.stats.map((stat) => [stat.administrativeArea, stat]));
    return {
      companyId: snapshot.companyId,
      companyName: snapshot.companyName,
      areas: areas.map((administrativeArea) => {
        const stat = stats.get(administrativeArea);
        return {
          administrativeArea,
          customerCount: stat?.customerCount || 0,
          recentLeadCount: stat?.recentLeadCount || 0,
          totalLeadCount: stat?.totalLeadCount || 0,
          territoryCovered: isSalesAreaCovered(administrativeArea, snapshot.areaState.defaultAreas),
          salesCovered: isSalesAreaCovered(administrativeArea, snapshot.areaState.explicitAreas)
        };
      })
    };
  });

  return {
    companies: rows,
    areas: areas.map((administrativeArea) => {
      const companyAreas = rows.map((row) => row.areas.find((area) => area.administrativeArea === administrativeArea)!);
      return {
        administrativeArea,
        customerCount: companyAreas.reduce((sum, area) => sum + area.customerCount, 0),
        recentLeadCount: companyAreas.reduce((sum, area) => sum + area.recentLeadCount, 0),
        totalLeadCount: companyAreas.reduce((sum, area) => sum + area.totalLeadCount, 0),
        territoryCount: companyAreas.filter((area) => area.territoryCovered).length,
        salesCount: companyAreas.filter((area) => area.salesCovered).length
      };
    })
  };
}
