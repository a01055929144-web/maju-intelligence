import { analyzeCompany } from "./analysis";
import { sampleCustomers } from "./sample-data";

export type AnalyzeJob = {
  id: string;
  company: string;
  rows: number;
  status: "completed" | "running" | "failed";
  uploadedAt: string;
  qualityScore: number;
};

export type AdminDashboard = {
  overview: {
    companies: number;
    uploadedFiles: number;
    processedRows: number;
    avgHealthScore: number;
  };
  jobs: AnalyzeJob[];
  dataQuality: Array<{ label: string; value: number; description: string }>;
  scoringWeights: Array<{ label: string; value: number; note: string }>;
  leadQueue: Array<{ name: string; region: string; score: number; status: string }>;
};

export function getBriefingPayload() {
  const report = analyzeCompany(sampleCustomers);

  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers: report.customers,
    weeklyOpportunities: report.newOpportunities,
    todayRecommendations: 12,
    highProbability: report.highProbabilityCount,
    routeLeads: report.routeLeads,
    missingRegions: report.missingRegions,
    healthScore: report.health.total
  };
}

export function getReportPayload() {
  return analyzeCompany(sampleCustomers);
}

export function getLeadPayload() {
  const report = analyzeCompany(sampleCustomers);

  return {
    total: report.leadRecommendations.length,
    leads: report.leadRecommendations.map((lead, index) => ({
      id: `lead-${index + 1}`,
      ...lead,
      expectedRevenue: Math.round(lead.score * 2.8),
      status: index < 3 ? "today" : "this-week"
    }))
  };
}

export function getAdminDashboard(): AdminDashboard {
  const report = analyzeCompany(sampleCustomers);
  const leads = getLeadPayload().leads;

  return {
    overview: {
      companies: 1,
      uploadedFiles: 4,
      processedRows: 1287,
      avgHealthScore: report.health.total
    },
    jobs: [
      {
        id: "job-1004",
        company: report.companyName,
        rows: sampleCustomers.length,
        status: "completed",
        uploadedAt: "2026-06-30 09:12",
        qualityScore: 91
      },
      {
        id: "job-1003",
        company: "서울푸드유통",
        rows: 483,
        status: "completed",
        uploadedAt: "2026-06-29 17:44",
        qualityScore: 86
      },
      {
        id: "job-1002",
        company: "한강식자재",
        rows: 321,
        status: "running",
        uploadedAt: "2026-06-29 15:20",
        qualityScore: 74
      }
    ],
    dataQuality: [
      { label: "주소 인식률", value: 88, description: "등록된 지역/주소 텍스트 기준으로 분석합니다." },
      { label: "중복 제거율", value: 96, description: "거래처명과 주소를 기준으로 중복을 제거합니다." },
      { label: "필수 컬럼 완성도", value: 91, description: "거래처명, 지역, 주소, 업종, 매출, 방문 정보를 확인합니다." },
      { label: "리포트 생성 성공률", value: 100, description: "등록 데이터와 업로드 데이터 모두 동일한 분석 엔진을 사용합니다." }
    ],
    scoringWeights: [
      { label: "영업력", value: 22, note: "최근 주문과 거래 규모" },
      { label: "배송효율", value: 18, note: "평균 거리와 동선 내 리드" },
      { label: "CRM관리", value: 16, note: "방문 횟수와 방치 거래처" },
      { label: "신규영업", value: 18, note: "White Space와 신규 기회" },
      { label: "집중도", value: 14, note: "특정 지역 쏠림 위험" },
      { label: "리스크", value: 12, note: "이탈 가능성과 업종 편중" }
    ],
    leadQueue: leads.slice(0, 8).map((lead) => ({
      name: lead.name,
      region: lead.region,
      score: lead.score,
      status: lead.status === "today" ? "오늘 추천" : "이번주 추천"
    }))
  };
}
