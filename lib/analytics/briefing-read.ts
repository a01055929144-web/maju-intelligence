type BriefingReport = {
  customers: number;
  health: { total: number };
  highProbabilityCount: number;
  leadRecommendations: unknown[];
  missingRegions: string[];
  newOpportunities: number;
  routeLeads: number;
};

type CustomerMaster = {
  customers: unknown[];
  source: "empty" | "supabase";
};

export async function readLatestBriefing(
  companyId: string | undefined,
  getReport: (companyId?: string) => Promise<BriefingReport>,
  getCustomers: (companyId?: string) => Promise<CustomerMaster>
) {
  const [report, customerMaster] = await Promise.all([
    getReport(companyId),
    getCustomers(companyId).catch(() => ({ customers: [], source: "empty" as const }))
  ]);
  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers: customerMaster.customers.length || report.customers,
    weeklyOpportunities: report.newOpportunities,
    todayRecommendations: Math.min(12, report.leadRecommendations.length),
    highProbability: report.highProbabilityCount,
    routeLeads: report.routeLeads,
    missingRegions: report.missingRegions,
    healthScore: report.health.total,
    source: customerMaster.source
  };
}
