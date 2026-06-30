import { analyzeCompany, AnalysisResult } from "./analysis";
import { getAdminDashboard, getLeadPayload } from "./backend";
import { CustomerRow, sampleCustomers } from "./sample-data";

export type RawUploadRow = Record<string, string | number | boolean | null | undefined>;
export type ColumnMapping = Record<string, string>;
export type UploadHistoryItem = {
  id: string;
  company: string;
  filename: string;
  reportId: string;
  rows: number;
  status: "completed" | "running" | "failed";
  qualityScore: number;
  duplicateCount: number;
  healthScore: number;
  createdAt: string;
};
export type LeadStatus = "today" | "reviewing" | "visit-planned" | "high-probability" | "excluded" | "this-week";
export type LeadItem = {
  id: string;
  name: string;
  region: string;
  score: number;
  reasons?: string[];
  status: LeadStatus | string;
  expectedRevenue: number;
};
export type RoutePlanStop = LeadItem & {
  order: number;
};
export type RoutePlanGroup = {
  region: string;
  stops: RoutePlanStop[];
  expectedRevenue: number;
};
export type RoutePlan = {
  totalStops: number;
  totalExpectedRevenue: number;
  groups: RoutePlanGroup[];
};
export type VisitResult = "visited" | "interested" | "quote-requested" | "pending" | "failed";
export type VisitTimelineItem = {
  id: string;
  leadName: string;
  region: string;
  result: VisitResult | string;
  memo: string;
  nextAction: string;
  expectedRevenue: number;
  visitedAt: string;
};
export type RevenuePipeline = {
  quoteRequests: number;
  interested: number;
  pending: number;
  failed: number;
  expectedRevenue: number;
  weightedRevenue: number;
  conversionRate: number;
  items: Array<VisitTimelineItem & { probability: number; weightedRevenue: number }>;
};
export type SalesAssistantDraft = {
  id: string;
  leadName: string;
  region: string;
  type: "follow-up" | "quote" | "summary";
  title: string;
  body: string;
  nextAction: string;
};
export type SystemStatus = {
  appUrlConfigured: boolean;
  adminConfigured: boolean;
  customerConfigured: boolean;
  mode: "production-db" | "local-fallback";
  requiredEnvironment: Array<{ key: string; present: boolean; scope: "server" | "client" }>;
  services: Array<{ name: string; status: "ready" | "fallback" | "missing"; description: string }>;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

type SupabaseRow = Record<string, unknown>;
const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function isProductionStoreConfigured() {
  return Boolean(getSupabaseConfig());
}

function getDefaultCompanyId() {
  return process.env.CUSTOMER_COMPANY_ID || DEFAULT_COMPANY_ID;
}

export function getSystemStatus(): SystemStatus {
  const supabaseConfigured = isProductionStoreConfigured();
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const adminConfigured = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
  const customerConfigured = Boolean(process.env.CUSTOMER_EMAIL && process.env.CUSTOMER_PASSWORD);

  return {
    appUrlConfigured,
    adminConfigured,
    customerConfigured,
    mode: supabaseConfigured ? "production-db" : "local-fallback",
    requiredEnvironment: [
      { key: "NEXT_PUBLIC_APP_URL", present: appUrlConfigured, scope: "client" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), scope: "client" },
      { key: "SUPABASE_URL", present: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL), scope: "server" },
      { key: "SUPABASE_SERVICE_ROLE_KEY", present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), scope: "server" },
      { key: "ADMIN_EMAIL", present: Boolean(process.env.ADMIN_EMAIL), scope: "server" },
      { key: "ADMIN_PASSWORD", present: Boolean(process.env.ADMIN_PASSWORD), scope: "server" },
      { key: "ADMIN_SESSION_SECRET", present: Boolean(process.env.ADMIN_SESSION_SECRET), scope: "server" },
      { key: "CUSTOMER_EMAIL", present: Boolean(process.env.CUSTOMER_EMAIL), scope: "server" },
      { key: "CUSTOMER_PASSWORD", present: Boolean(process.env.CUSTOMER_PASSWORD), scope: "server" }
    ],
    services: [
      {
        name: "Supabase Postgres",
        status: supabaseConfigured ? "ready" : "fallback",
        description: supabaseConfigured ? "실 DB 적재 모드입니다." : "환경변수가 없어 샘플 데이터 fallback으로 동작합니다."
      },
      {
        name: "Admin Auth",
        status: adminConfigured ? "ready" : "fallback",
        description: adminConfigured ? "관리자 환경변수가 설정되었습니다." : "로컬 기본 관리자 계정을 사용합니다."
      },
      {
        name: "Customer Auth",
        status: customerConfigured ? "ready" : "fallback",
        description: customerConfigured ? "고객사 환경변수가 설정되었습니다." : "로컬 기본 고객사 계정을 사용합니다."
      },
      {
        name: "Analysis Pipeline",
        status: "ready",
        description: "엑셀 분석, raw 저장, 정제, 리포트, 리드 추천 흐름이 준비되었습니다."
      },
      {
        name: "Revenue Intelligence",
        status: "ready",
        description: "방문 결과 기반 매출 파이프라인 계산이 준비되었습니다."
      }
    ]
  };
}

export async function saveAnalysis(
  rows: CustomerRow[],
  companyName = "업로드 고객사",
  options: {
    companyId?: string;
    rawRows?: RawUploadRow[];
    columnMapping?: ColumnMapping;
    originalFilename?: string;
    actorName?: string;
  } = {}
) {
  const report = analyzeCompany(rows.length ? rows : sampleCustomers);
  const duplicateCount = countDuplicates(rows);
  const qualityScore = estimateQualityScore(rows);

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      report,
      pipeline: {
        rows: rows.length,
        rawRows: options.rawRows?.length || 0,
        columnMappings: Object.keys(options.columnMapping || {}).length,
        duplicateCount,
        qualityScore
      }
    };
  }

  const companyId = options.companyId || (await createCompany(report.companyName || companyName));

  const files = await supabaseRequest<Array<{ id: string }>>("uploaded_files", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        original_filename: options.originalFilename || "browser-upload.xlsx",
        status: "processed"
      }
    ])
  });
  const uploadedFileId = files[0].id;

  const imports = await supabaseRequest<Array<{ id: string }>>("customer_imports", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        source: "excel",
        row_count: rows.length,
        status: "completed",
        quality_score: qualityScore,
        duplicate_count: duplicateCount,
        completed_at: new Date().toISOString()
      }
    ])
  });
  const importId = imports[0].id;

  const mappingRows = Object.entries(options.columnMapping || {}).map(([targetField, sourceHeader]) => ({
    company_id: companyId,
    import_id: importId,
    source_header: sourceHeader,
    target_field: targetField,
    confidence: 100
  }));

  if (mappingRows.length) {
    await supabaseRequest("column_mappings", {
      method: "POST",
      body: JSON.stringify(mappingRows)
    });
  }

  const rawRows = (options.rawRows?.length ? options.rawRows : rows).map((row, index) => ({
    company_id: companyId,
    import_id: importId,
    row_index: index + 1,
    raw_data: row
  }));

  if (rawRows.length) {
    await supabaseRequest("raw_customer_rows", {
      method: "POST",
      body: JSON.stringify(rawRows)
    });
  }

  const normalizedRows = rows.map((row) => {
    const normalizedKey = makeNormalizedKey(row);
    return {
      company_id: companyId,
      import_id: importId,
      customer_name: row.customerName,
      region: row.region,
      address: row.address,
      industry: row.industry,
      monthly_revenue: row.monthlyRevenue,
      last_order_days: row.lastOrderDays,
      visit_count: row.visitCount,
      delivery_km: row.deliveryKm,
      normalized_key: normalizedKey,
      duplicate_of: null
    };
  });

  if (normalizedRows.length) {
    await supabaseRequest("normalized_customers", {
      method: "POST",
      body: JSON.stringify(normalizedRows)
    });
  }

  const legacyCustomerRows = rows.map((row) => ({
    company_id: companyId,
    import_id: importId,
    customer_name: row.customerName,
    region: row.region,
    address: row.address,
    industry: row.industry,
    monthly_revenue: row.monthlyRevenue,
    last_order_days: row.lastOrderDays,
    visit_count: row.visitCount,
    delivery_km: row.deliveryKm
  }));

  await supabaseRequest("admin_audit_logs", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        action: "excel_upload_analyzed",
        target_type: "customer_import",
        target_id: importId,
        metadata: {
          actorName: options.actorName || "local-mvp-user",
          rows: rows.length,
          rawRows: rawRows.length,
          mappings: mappingRows.length,
          duplicateCount,
          qualityScore
        }
      }
    ])
  });

  if (legacyCustomerRows.length) {
    await supabaseRequest("customer_rows", {
      method: "POST",
      body: JSON.stringify(legacyCustomerRows)
    }).catch(() => null);
  }

  const reports = await supabaseRequest<Array<{ id: string }>>("ai_reports", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        import_id: importId,
        health_score: report.health.total,
        report
      }
    ])
  });
  const reportId = reports[0].id;

  await supabaseRequest("health_score_snapshots", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        report_id: reportId,
        total: report.health.total,
        sales_power: report.health.salesPower,
        delivery_efficiency: report.health.deliveryEfficiency,
        crm_management: report.health.crmManagement,
        new_sales: report.health.newSales,
        concentration: report.health.concentration,
        risk: report.health.risk,
        formula_version: "v1"
      }
    ])
  });

  const leads = report.leadRecommendations.map((lead) => ({
    company_id: companyId,
    report_id: reportId,
    name: lead.name,
    region: lead.region,
    score: lead.score,
    reasons: lead.reasons,
    status: lead.score >= 90 ? "today" : "this-week"
  }));

  if (leads.length) {
    await supabaseRequest("lead_recommendations", {
      method: "POST",
      body: JSON.stringify(leads)
    });
  }

  return {
    persisted: true,
    companyId,
    uploadedFileId,
    importId,
    reportId,
    report,
    pipeline: {
      rows: rows.length,
      rawRows: rawRows.length,
      columnMappings: mappingRows.length,
      duplicateCount,
      qualityScore
    }
  };
}

export async function getLatestReport(companyId?: string): Promise<AnalysisResult> {
  if (!isProductionStoreConfigured()) return analyzeCompany(sampleCustomers);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report${companyFilter}&order=created_at.desc&limit=1`
  );
  return reports[0]?.report || analyzeCompany(sampleCustomers);
}

export async function getReportById(reportId: string, companyId?: string): Promise<AnalysisResult | null> {
  if (!isProductionStoreConfigured()) return analyzeCompany(sampleCustomers);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report&id=eq.${encodeURIComponent(reportId)}${companyFilter}&limit=1`
  );

  return reports[0]?.report || null;
}

export async function getLatestBriefing(companyId?: string) {
  const report = await getLatestReport(companyId);

  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers: report.customers,
    weeklyOpportunities: report.newOpportunities,
    todayRecommendations: Math.min(12, report.leadRecommendations.length),
    highProbability: report.highProbabilityCount,
    routeLeads: report.routeLeads,
    missingRegions: report.missingRegions,
    healthScore: report.health.total,
    source: isProductionStoreConfigured() ? "supabase" : "sample"
  };
}

export async function getLatestLeads(companyId?: string) {
  if (!isProductionStoreConfigured()) return getLeadPayload();

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{ id: string; name: string; region: string; score: number; reasons: string[]; status: LeadStatus | string }>
  >(`lead_recommendations?select=id,name,region,score,reasons,status${companyFilter}&order=score.desc&limit=50`);

  return {
    total: rows.length,
    leads: rows.map((lead) => ({
      ...lead,
      expectedRevenue: Math.round(lead.score * 2.8)
    }))
  };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, companyId?: string) {
  if (!isProductionStoreConfigured()) {
    return { persisted: false, id: leadId, status };
  }

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<Array<{ id: string; status: LeadStatus }>>(`lead_recommendations?id=eq.${encodeURIComponent(leadId)}${companyFilter}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  return { persisted: true, id: rows[0]?.id || leadId, status: rows[0]?.status || status };
}

export async function getTodayRoutePlan(companyId?: string): Promise<RoutePlan> {
  const leadPayload = await getLatestLeads(companyId);
  const planned = (leadPayload.leads as LeadItem[])
    .filter((lead) => lead.status === "visit-planned" || lead.status === "today" || lead.status === "high-probability")
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((lead, index) => ({ ...lead, order: index + 1 }));

  const groupMap = new Map<string, RoutePlanStop[]>();
  planned.forEach((lead) => {
    const region = lead.region || "미분류";
    groupMap.set(region, [...(groupMap.get(region) || []), lead]);
  });

  const groups = Array.from(groupMap.entries())
    .map(([region, stops]) => ({
      region,
      stops,
      expectedRevenue: stops.reduce((total, stop) => total + stop.expectedRevenue, 0)
    }))
    .sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  return {
    totalStops: planned.length,
    totalExpectedRevenue: planned.reduce((total, stop) => total + stop.expectedRevenue, 0),
    groups
  };
}

export async function saveVisitResult(input: {
  companyId?: string;
  expectedRevenue?: number;
  leadId: string;
  memo?: string;
  nextAction?: string;
  result: VisitResult;
}) {
  if (!isProductionStoreConfigured()) {
    return { persisted: false, ...input };
  }

  const rows = await supabaseRequest<Array<{ id: string }>>("visit_results", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: input.companyId || getDefaultCompanyId(),
        lead_id: input.leadId,
        result: input.result,
        memo: input.memo || null,
        next_action: input.nextAction || null,
        expected_revenue: input.expectedRevenue || null
      }
    ])
  });

  if (input.result === "quote-requested" || input.result === "interested") {
    await updateLeadStatus(input.leadId, "high-probability", input.companyId).catch(() => null);
  }

  return { persisted: true, id: rows[0]?.id, ...input };
}

export async function getVisitTimeline(companyId?: string): Promise<VisitTimelineItem[]> {
  if (!isProductionStoreConfigured()) return getSampleVisitTimeline();

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      result: VisitResult | string;
      memo: string | null;
      next_action: string | null;
      expected_revenue: number | null;
      visited_at: string;
      lead_recommendations: { name: string; region: string } | null;
    }>
  >(
    `visit_results?select=id,result,memo,next_action,expected_revenue,visited_at,lead_recommendations(name,region)${companyFilter}&order=visited_at.desc&limit=30`
  );

  return rows.map((row) => ({
    id: row.id,
    leadName: row.lead_recommendations?.name || "리드",
    region: row.lead_recommendations?.region || "미분류",
    result: row.result,
    memo: row.memo || "",
    nextAction: row.next_action || "",
    expectedRevenue: Number(row.expected_revenue || 0),
    visitedAt: new Date(row.visited_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  }));
}

export async function getRevenuePipeline(companyId?: string): Promise<RevenuePipeline> {
  const timeline = await getVisitTimeline(companyId);
  const items = timeline
    .filter((item) => item.result === "quote-requested" || item.result === "interested" || item.result === "pending" || item.result === "failed")
    .map((item) => {
      const probability = getRevenueProbability(item.result);
      return {
        ...item,
        probability,
        weightedRevenue: Math.round(item.expectedRevenue * probability)
      };
    });

  const quoteRequests = items.filter((item) => item.result === "quote-requested").length;
  const interested = items.filter((item) => item.result === "interested").length;
  const pending = items.filter((item) => item.result === "pending").length;
  const failed = items.filter((item) => item.result === "failed").length;
  const expectedRevenue = items.reduce((total, item) => total + item.expectedRevenue, 0);
  const weightedRevenue = items.reduce((total, item) => total + item.weightedRevenue, 0);
  const conversionRate = items.length ? Math.round(((quoteRequests + interested * 0.55) / items.length) * 100) : 0;

  return {
    quoteRequests,
    interested,
    pending,
    failed,
    expectedRevenue,
    weightedRevenue,
    conversionRate,
    items
  };
}

export async function getSalesAssistantDrafts(companyId?: string): Promise<SalesAssistantDraft[]> {
  const timeline = await getVisitTimeline(companyId);
  const targetItems = timeline.filter((item) => item.result === "quote-requested" || item.result === "interested" || item.result === "visited").slice(0, 8);

  return targetItems.flatMap((item) => {
    const drafts: SalesAssistantDraft[] = [
      {
        id: `${item.id}-summary`,
        leadName: item.leadName,
        region: item.region,
        type: "summary",
        title: "방문 요약",
        body: `${item.region} ${item.leadName} 방문 결과는 '${getVisitResultLabel(item.result)}'입니다. 메모: ${item.memo || "특이사항 없음"}. 예상 월매출은 ${item.expectedRevenue.toLocaleString()}만원입니다.`,
        nextAction: item.nextAction || "후속 연락"
      },
      {
        id: `${item.id}-follow-up`,
        leadName: item.leadName,
        region: item.region,
        type: "follow-up",
        title: "후속 메시지 초안",
        body: `안녕하세요, ${item.leadName} 대표님. 오늘 상담 감사드립니다. 말씀 주신 내용 기준으로 ${item.region} 지역 납품 조건과 추천 품목을 정리해서 전달드리겠습니다. 필요하신 품목이나 현재 사용 중인 단가표가 있으시면 함께 확인해드리겠습니다.`,
        nextAction: item.result === "interested" ? "재방문 일정 조율" : item.nextAction || "후속 메시지 발송"
      }
    ];

    if (item.result === "quote-requested") {
      drafts.push({
        id: `${item.id}-quote`,
        leadName: item.leadName,
        region: item.region,
        type: "quote",
        title: "견적 요청 메모",
        body: `${item.leadName} 견적 요청. 지역: ${item.region}. 예상 월매출: ${item.expectedRevenue.toLocaleString()}만원. 방문 메모를 기준으로 주력 품목, 납품 주기, 결제 조건을 확인한 뒤 견적서 초안을 생성해야 합니다.`,
        nextAction: "견적서 발송"
      });
    }

    return drafts;
  });
}

export async function getCompanyDashboardPayload(companyId?: string) {
  const [briefing, report, leads, uploadHistory] = await Promise.all([
    getLatestBriefing(companyId),
    getLatestReport(companyId),
    getLatestLeads(companyId),
    getUploadHistory(companyId)
  ]);

  return {
    briefing,
    report,
    leads,
    uploadHistory,
    source: isProductionStoreConfigured() ? "supabase" : "sample"
  };
}

export async function getAdminDashboardPayload() {
  if (!isProductionStoreConfigured()) return { ...getAdminDashboard(), uploadHistory: getSampleUploadHistory(), source: "sample" };

  const [companies, imports, reports, leads, uploadHistory] = await Promise.all([
    supabaseRequest<SupabaseRow[]>("companies?select=id"),
    supabaseRequest<
      Array<{
        id: string;
        row_count: number;
        status: string;
        quality_score: number;
        duplicate_count: number;
        created_at: string;
        companies: { name: string };
      }>
    >(
      "customer_imports?select=id,row_count,status,quality_score,duplicate_count,created_at,companies(name)&order=created_at.desc&limit=20"
    ),
    supabaseRequest<Array<{ health_score: number }>>("ai_reports?select=health_score&order=created_at.desc&limit=50"),
    supabaseRequest<Array<{ id: string; name: string; region: string; score: number; status: string }>>(
      "lead_recommendations?select=id,name,region,score,status&order=score.desc&limit=20"
    ),
    getUploadHistory()
  ]);

  const avgHealthScore = reports.length
    ? Math.round(reports.reduce((total, report) => total + Number(report.health_score || 0), 0) / reports.length)
    : 0;
  const processedRows = imports.reduce((total, item) => total + Number(item.row_count || 0), 0);
  const avgQuality = imports.length
    ? Math.round(imports.reduce((total, item) => total + Number(item.quality_score || 0), 0) / imports.length)
    : 0;

  return {
    ...getAdminDashboard(),
    source: "supabase",
    overview: {
      companies: companies.length,
      uploadedFiles: imports.length,
      processedRows,
      avgHealthScore
    },
    jobs: imports.map((item) => ({
      id: item.id,
      company: item.companies?.name || "고객사",
      rows: item.row_count,
      status: item.status as "completed" | "running" | "failed",
      uploadedAt: new Date(item.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      qualityScore: item.quality_score
    })),
    dataQuality: [
      { label: "주소 인식률", value: avgQuality, description: "업로드 데이터의 주소/지역 필드 완성도를 봅니다." },
      { label: "중복 제거율", value: 96, description: "거래처명과 주소를 기준으로 중복을 제거합니다." },
      { label: "필수 컬럼 완성도", value: avgQuality, description: "거래처명, 지역, 주소, 업종, 매출, 방문 정보를 확인합니다." },
      { label: "리포트 생성 성공률", value: reports.length ? 100 : 0, description: "실 DB에 생성된 AI 리포트 기준입니다." }
    ],
    leadQueue: leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      region: lead.region,
      score: lead.score,
      status: lead.status === "today" ? "오늘 추천" : lead.status === "this-week" ? "이번주 추천" : lead.status,
      statusValue: lead.status
    })),
    uploadHistory
  };
}

export async function getUploadHistory(companyId?: string): Promise<UploadHistoryItem[]> {
  if (!isProductionStoreConfigured()) return getSampleUploadHistory(companyId);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      row_count: number;
      status: "completed" | "running" | "failed";
      quality_score: number;
      duplicate_count: number;
      created_at: string;
      companies: { name: string };
      uploaded_files: { original_filename: string } | null;
      ai_reports: Array<{ id: string; health_score: number }>;
    }>
  >(
    `customer_imports?select=id,row_count,status,quality_score,duplicate_count,created_at,companies(name),uploaded_files(original_filename),ai_reports(id,health_score)${companyFilter}&order=created_at.desc&limit=12`
  );

  return rows.map((row) => ({
    id: row.id,
    company: row.companies?.name || "고객사",
    filename: row.uploaded_files?.original_filename || "업로드 파일",
    reportId: row.ai_reports?.[0]?.id || "",
    rows: row.row_count,
    status: row.status,
    qualityScore: row.quality_score,
    duplicateCount: row.duplicate_count,
    healthScore: row.ai_reports?.[0]?.health_score || 0,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  }));
}

function estimateQualityScore(rows: CustomerRow[]) {
  if (!rows.length) return 0;

  const fields: Array<keyof CustomerRow> = ["customerName", "region", "address", "industry", "monthlyRevenue", "lastOrderDays", "visitCount", "deliveryKm"];
  const total = rows.length * fields.length;
  const filled = rows.reduce(
    (count, row) => count + fields.filter((field) => row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== "").length,
    0
  );

  return Math.round((filled / total) * 100);
}

function makeNormalizedKey(row: CustomerRow) {
  return `${row.customerName}-${row.address}`
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-zA-Z가-힣-]/g, "");
}

function countDuplicates(rows: CustomerRow[]) {
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((row) => {
    const key = makeNormalizedKey(row);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });

  return duplicates;
}

async function createCompany(name: string) {
  const companies = await supabaseRequest<Array<{ id: string }>>("companies", {
    method: "POST",
    body: JSON.stringify([{ name }])
  });

  return companies[0].id;
}

function getSampleUploadHistory(companyId?: string): UploadHistoryItem[] {
  const company = companyId ? "마주식자재" : "마주식자재";

  return [
    {
      id: "sample-import-003",
      company,
      filename: "거래처_현황_2026_06.xlsx",
      reportId: "sample-report-003",
      rows: 483,
      status: "completed",
      qualityScore: 92,
      duplicateCount: 7,
      healthScore: 84,
      createdAt: "2026. 6. 30. 오전 9:12"
    },
    {
      id: "sample-import-002",
      company,
      filename: "6월_매출거래처.xlsx",
      reportId: "sample-report-002",
      rows: 321,
      status: "completed",
      qualityScore: 88,
      duplicateCount: 4,
      healthScore: 81,
      createdAt: "2026. 6. 24. 오후 4:40"
    },
    {
      id: "sample-import-001",
      company,
      filename: "신규영업리스트.csv",
      reportId: "sample-report-001",
      rows: 147,
      status: "completed",
      qualityScore: 79,
      duplicateCount: 11,
      healthScore: 76,
      createdAt: "2026. 6. 17. 오전 11:03"
    }
  ];
}

function getSampleVisitTimeline(): VisitTimelineItem[] {
  return [
    {
      id: "sample-visit-003",
      leadName: "성수 한식 A",
      region: "성수동",
      result: "quote-requested",
      memo: "대표가 단가표 요청. 다음주 월요일 견적 발송 필요.",
      nextAction: "견적서 발송",
      expectedRevenue: 260,
      visitedAt: "2026. 6. 30. 오후 3:20"
    },
    {
      id: "sample-visit-002",
      leadName: "송파 신규오픈 B",
      region: "송파구",
      result: "interested",
      memo: "샘플 납품 가능 여부 확인 요청.",
      nextAction: "재방문 일정 조율",
      expectedRevenue: 244,
      visitedAt: "2026. 6. 30. 오후 1:10"
    },
    {
      id: "sample-visit-001",
      leadName: "강남구 한식 A",
      region: "강남구",
      result: "visited",
      memo: "기존 거래처 있음. 다음 달 재접촉.",
      nextAction: "후속 콜",
      expectedRevenue: 251,
      visitedAt: "2026. 6. 29. 오전 11:40"
    }
  ];
}

function getRevenueProbability(result: string) {
  if (result === "quote-requested") return 0.72;
  if (result === "interested") return 0.46;
  if (result === "pending") return 0.22;
  return 0.05;
}

function getVisitResultLabel(result: string) {
  if (result === "quote-requested") return "견적 요청";
  if (result === "interested") return "관심 있음";
  if (result === "visited") return "방문 완료";
  if (result === "pending") return "보류";
  if (result === "failed") return "실패";
  return result;
}
