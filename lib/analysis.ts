import { CustomerRow, marketPotential } from "./sample-data";

export type HealthScore = {
  total: number;
  salesPower: number;
  deliveryEfficiency: number;
  crmManagement: number;
  newSales: number;
  concentration: number;
  risk: number;
};

export type LeadRecommendation = {
  name: string;
  region: string;
  score: number;
  reasons: string[];
};

export type AnalysisResult = {
  companyName: string;
  customers: number;
  regions: number;
  totalRevenue: number;
  avgDeliveryKm: number;
  highProbabilityCount: number;
  newOpportunities: number;
  routeLeads: number;
  missingRegions: string[];
  regionDistribution: Array<{ region: string; count: number; potential: number; whitespace: number }>;
  industryDistribution: Array<{ industry: string; count: number; share: number }>;
  health: HealthScore;
  leadRecommendations: LeadRecommendation[];
  aiInsights: string[];
  potentialRevenue: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export function normalizeRows(rows: CustomerRow[]) {
  const seen = new Set<string>();
  return rows
    .map((row) => ({
      ...row,
      companyName: String(row.companyName || "MAJU 고객사").trim(),
      customerName: String(row.customerName || "").trim(),
      region: String(row.region || "미분류").trim(),
      address: String(row.address || "").trim(),
      industry: String(row.industry || "미분류").trim(),
      monthlyRevenue: Number(row.monthlyRevenue) || 0,
      lastOrderDays: Number(row.lastOrderDays) || 0,
      visitCount: Number(row.visitCount) || 0,
      deliveryKm: Number(row.deliveryKm) || 0
    }))
    .filter((row) => {
      const key = `${row.customerName}-${row.address}`;
      if (!row.customerName || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function analyzeCompany(inputRows: CustomerRow[]): AnalysisResult {
  const rows = normalizeRows(inputRows);
  const companyName = rows[0]?.companyName || "MAJU 고객사";
  const totalRevenue = sum(rows.map((row) => row.monthlyRevenue));
  const avgDeliveryKm = rows.length ? sum(rows.map((row) => row.deliveryKm)) / rows.length : 0;
  const activeCustomers = rows.filter((row) => row.lastOrderDays <= 10).length;
  const neglectedCustomers = rows.filter((row) => row.lastOrderDays >= 21).length;

  const regionMap = new Map<string, number>();
  const industryMap = new Map<string, number>();
  rows.forEach((row) => {
    regionMap.set(row.region, (regionMap.get(row.region) || 0) + 1);
    industryMap.set(row.industry, (industryMap.get(row.industry) || 0) + 1);
  });

  const regionDistribution = Array.from(regionMap.entries())
    .map(([region, count]) => {
      const potential = marketPotential[region] || Math.max(80, count * 34);
      return { region, count, potential, whitespace: Math.max(0, potential - count) };
    })
    .sort((a, b) => b.count - a.count);

  const industryDistribution = Array.from(industryMap.entries())
    .map(([industry, count]) => ({ industry, count, share: rows.length ? Math.round((count / rows.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  const missingRegions = Object.entries(marketPotential)
    .map(([region, potential]) => ({ region, count: regionMap.get(region) || 0, potential }))
    .sort((a, b) => b.potential - b.count * 70 - (a.potential - a.count * 70))
    .slice(0, 3)
    .map((item) => item.region);

  const highProbabilityCount = rows.filter((row) => row.monthlyRevenue >= 350 && row.lastOrderDays <= 7).length;
  const newOpportunities = regionDistribution.reduce((acc, region) => acc + Math.min(40, Math.round(region.whitespace * 0.18)), 0);
  const routeLeads = regionDistribution.filter((region) => region.count >= 2).reduce((acc, region) => acc + Math.min(12, Math.round(region.whitespace * 0.04)), 0);

  const salesPower = clamp((activeCustomers / Math.max(rows.length, 1)) * 76 + Math.min(totalRevenue / Math.max(rows.length, 1) / 8, 24));
  const deliveryEfficiency = clamp(100 - avgDeliveryKm * 1.35 + routeLeads * 0.8);
  const crmManagement = clamp(85 - neglectedCustomers * 7 + rows.filter((row) => row.visitCount >= 3).length * 2);
  const newSales = clamp(42 + newOpportunities / 2.2 - rows.length * 0.15);
  const concentration = clamp(100 - ((regionDistribution[0]?.count || 0) / Math.max(rows.length, 1)) * 36);
  const risk = clamp(82 - neglectedCustomers * 6 - industryDistribution[0]?.share * 0.12);
  const total = clamp(
    salesPower * 0.22 +
      deliveryEfficiency * 0.18 +
      crmManagement * 0.16 +
      newSales * 0.18 +
      concentration * 0.14 +
      risk * 0.12
  );

  const topWhitespace = [...regionDistribution].sort((a, b) => b.whitespace - a.whitespace)[0];
  const topIndustry = industryDistribution[0];
  const leadRecommendations = buildLeadRecommendations(regionDistribution, topIndustry?.industry || "한식");

  return {
    companyName,
    customers: rows.length,
    regions: regionMap.size,
    totalRevenue,
    avgDeliveryKm,
    highProbabilityCount,
    newOpportunities,
    routeLeads,
    missingRegions,
    regionDistribution,
    industryDistribution,
    health: { total, salesPower, deliveryEfficiency, crmManagement, newSales, concentration, risk },
    leadRecommendations,
    potentialRevenue: Math.round(newOpportunities * 17.4),
    aiInsights: [
      `${regionDistribution[0]?.region || "핵심 지역"} 비중이 가장 높습니다. 기존 강점을 유지하되 주변 2km 신규 리드를 먼저 확인하세요.`,
      `평균 배송거리는 ${avgDeliveryKm.toFixed(1)}km입니다. 반경 기준으로 묶으면 하루 약 ${Math.max(18, Math.round(avgDeliveryKm * 2.8))}km 절감 여지가 있습니다.`,
      `${topWhitespace?.region || "송파구"}는 현재 거래처 대비 시장 여지가 큽니다. 이번 주 우선 공략 지역으로 추천합니다.`,
      `${topIndustry?.industry || "한식"} 업종에서 전문성이 확인됩니다. 운영 리포트에서는 이 업종을 확장하고 카페/베이커리는 검증 리드로 분리하세요.`
    ]
  };
}

function buildLeadRecommendations(regions: AnalysisResult["regionDistribution"], industry: string): LeadRecommendation[] {
  const regionPool = regions.length ? regions : [{ region: "성수동", count: 3, potential: 214, whitespace: 211 }];
  return regionPool
    .flatMap((region, index) => [
      {
        name: `${region.region} ${industry} A`,
        region: region.region,
        score: clamp(94 - index * 4 + Math.min(region.count, 8)),
        reasons: ["배송반경", "예상매출", "업종 적합"]
      },
      {
        name: `${region.region} 신규오픈 B`,
        region: region.region,
        score: clamp(89 - index * 3 + Math.min(region.whitespace / 90, 6)),
        reasons: ["신규오픈", "White Space", "경쟁사 미확인"]
      }
    ])
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
