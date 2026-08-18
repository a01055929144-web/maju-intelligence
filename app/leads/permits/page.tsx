"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  CircleSlash,
  ListFilter,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Upload,
  UserCheck,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SectionHeader } from "@/components/section-header";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";

type PermitLeadPeriod = "today" | "week" | "month" | "recent";

type PermitLead = {
  id: string;
  businessName: string;
  businessNumber?: string;
  representativeName?: string;
  permitStatus?: string;
  isActive: boolean;
  permitDate?: string;
  openDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  leadPeriod: PermitLeadPeriod;
  industryPrimary: string;
  industryTags: string[];
  isTargetIndustry: boolean;
  isDuplicate: boolean;
  matchedCustomerId?: string;
  status: string;
  nextAction?: string;
  nextActionReasons: string[];
  excludeReason?: string;
  scoreTotal: number;
  scoreBreakdown: Record<string, number>;
  grade: "A" | "B" | "C" | null;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googlePlaceUrl?: string;
  instagramUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type PermitLeadQueues = {
  callToday: PermitLead[];
  dmCandidates: PermitLead[];
  needsEnrichment: PermitLead[];
  visitThisWeek: PermitLead[];
  summary: { active: number; gradeA: number; hasPhone: number; todayNew: number; total: number };
};

type UploadResult = {
  total: number;
  inserted: number;
  updated: number;
  duplicates: number;
  excludedInactive: number;
  excludedNonTarget: number;
  skippedNoName: number;
};

type ViewMode = "queues" | "list" | "map";

const PERIOD_OPTIONS: Array<{ label: string; value: "all" | PermitLeadPeriod }> = [
  { label: "전체 기간", value: "all" },
  { label: "오늘 신규", value: "today" },
  { label: "이번 주 신규", value: "week" },
  { label: "이번 달 신규", value: "month" },
  { label: "최근 90일", value: "recent" }
];

const PERIOD_BADGE_LABEL: Record<PermitLeadPeriod, string> = {
  today: "오늘 신규",
  week: "이번 주 신규",
  month: "이번 달 신규",
  recent: "최근 90일"
};

const ACTION_OPTIONS = ["오늘 바로 전화", "오늘 DM 발송", "전화·DM 검토", "정보 보강", "제외 검토"];

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function withCompanyQuery(path: string) {
  const companyId = getAdminCompanyIdFromUrl();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

// 지방행정 인허가 데이터 표준 컬럼명(공공데이터포털/LOCALDATA 기준)과 흔히 쓰는 변형을 함께 인식합니다.
const PERMIT_HEADER_ALIASES: Record<string, string[]> = {
  businessName: ["사업장명", "상호명", "업체명", "거래처명"],
  businessNumber: ["사업자번호", "사업자등록번호"],
  representativeName: ["대표자명", "대표자"],
  permitStatus: ["영업상태명", "상세영업상태명", "영업상태"],
  permitDate: ["인허가일자", "인허가일"],
  openDate: ["개업일자", "개업일"],
  address: ["도로명전체주소", "소재지전체주소", "지번주소", "도로명주소", "주소"],
  phone: ["소재지전화", "전화번호", "연락처"],
  jurisdiction: ["개방자치단체명", "관할기관"],
  industry: ["업태구분명", "업종명", "위생업태명", "업종"]
};

function normalizeHeaderText(text: string) {
  return text.replace(/[\s()（）]/g, "").toLowerCase();
}

function matchHeaderField(header: string): string | null {
  const normalized = normalizeHeaderText(header);
  for (const [field, aliases] of Object.entries(PERMIT_HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeaderText(alias) === normalized)) return field;
  }
  return null;
}

async function parsePermitExcelFile(file: File) {
  // 엑셀 읽기 라이브러리는 업로드 버튼을 눌렀을 때만 불러옵니다(초기 번들 크기 절약).
  const { readSheet } = await import("read-excel-file/browser");
  const rows = (await readSheet(file, 1)) as unknown[][];
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  if (headerIndex < 0) return { rows: [] as Record<string, string>[], unmatchedHeaders: [] as string[] };

  const headers = rows[headerIndex].map((cell) => String(cell ?? "").trim());
  const fieldByColumn = headers.map((header) => (header ? matchHeaderField(header) : null));
  const unmatchedHeaders = Array.from(new Set(headers.filter((header, index) => header && !fieldByColumn[index])));

  const parsedRows = rows
    .slice(headerIndex + 1)
    .map((row) => {
      const record: Record<string, string> = {};
      fieldByColumn.forEach((field, index) => {
        if (!field) return;
        const cell = row[index];
        const value = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim();
        if (value) record[field] = value;
      });
      return record;
    })
    .filter((record) => record.businessName);

  return { rows: parsedRows, unmatchedHeaders };
}

function gradeToneClassName(grade: PermitLead["grade"]) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  if (grade === "C") return "bg-slate-100 text-slate-700";
  return "bg-slate-50 text-slate-400";
}

function useAdminCompanyId() {
  const [companyId, setCompanyId] = useState("");
  useEffect(() => setCompanyId(getAdminCompanyIdFromUrl()), []);
  return companyId;
}

export default function PermitLeadsPage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);

  const [leads, setLeads] = useState<PermitLead[]>([]);
  const [queues, setQueues] = useState<PermitLeadQueues | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [viewMode, setViewMode] = useState<ViewMode>("queues");

  const [periodFilter, setPeriodFilter] = useState<"all" | PermitLeadPeriod>("all");
  const [industryFilter, setIndustryFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [gradeFilter, setGradeFilter] = useState("");
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false);
  const [excludeExcluded, setExcludeExcluded] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadWarning, setUploadWarning] = useState("");

  const [selectedLead, setSelectedLead] = useState<PermitLead | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const loadLeads = useCallback(() => {
    setLoadState((current) => (current === "ready" ? current : "loading"));
    const params = new URLSearchParams();
    if (periodFilter !== "all") params.set("period", periodFilter);
    if (industryFilter) params.set("industry", industryFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (gradeFilter) params.set("grade", gradeFilter);
    if (hasPhoneOnly) params.set("hasPhone", "true");
    if (!excludeExcluded) params.set("excludeExcluded", "false");

    fetch(withCompanyQuery(`/api/leads/permits?${params.toString()}`), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload) {
          setLoadState("error");
          return;
        }
        setLeads(Array.isArray(payload.leads) ? payload.leads : []);
        setQueues(payload.queues || null);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [periodFilter, industryFilter, actionFilter, gradeFilter, hasPhoneOnly, excludeExcluded, adminCompanyId]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const industryOptions = useMemo(() => Array.from(new Set(leads.map((lead) => lead.industryPrimary))).sort(), [leads]);

  async function handleFileUpload(file: File) {
    setUploadBusy(true);
    setUploadResult(null);
    setUploadWarning("");
    try {
      const { rows, unmatchedHeaders } = await parsePermitExcelFile(file);
      if (!rows.length) {
        setUploadWarning("인식 가능한 행이 없습니다. '사업장명' 컬럼이 있는 파일인지 확인하세요.");
        return;
      }
      const response = await fetch(withCompanyQuery("/api/leads/permits"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setUploadWarning(payload?.message || "업로드에 실패했습니다.");
        return;
      }
      setUploadResult(payload);
      if (unmatchedHeaders.length) setUploadWarning(`인식하지 못한 컬럼(무시됨): ${unmatchedHeaders.join(", ")}`);
      loadLeads();
    } catch (error) {
      setUploadWarning(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function runLeadAction(lead: PermitLead, actionType: "call" | "dm" | "visit" | "hold" | "exclude", result?: string) {
    setActionMessage("");
    try {
      const response = await fetch(withCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, result })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionMessage(payload?.message || "처리에 실패했습니다.");
        return;
      }
      setActionMessage(`${lead.businessName} · "${payload.status}"로 갱신했습니다.`);
      setSelectedLead(null);
      loadLeads();
    } catch {
      setActionMessage("네트워크 오류로 처리하지 못했습니다.");
    }
  }

  async function convertToCustomer(lead: PermitLead) {
    setActionMessage("");
    try {
      const response = await fetch(withCompanyQuery(`/api/leads/permits/${lead.id}/convert`), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionMessage(payload?.message || "거래처 전환에 실패했습니다.");
        return;
      }
      setActionMessage(`${lead.businessName}을(를) 거래처로 전환했습니다.`);
      setSelectedLead(null);
      loadLeads();
    } catch {
      setActionMessage("네트워크 오류로 처리하지 못했습니다.");
    }
  }

  const mapMarkers: KakaoMapMarker[] = useMemo(() => {
    if (viewMode !== "map") return [];
    return leads
      .filter((lead) => lead.status !== "제외" && lead.address)
      .map((lead) => ({
        id: lead.id,
        name: lead.businessName,
        address: lead.address!,
        label: lead.leadPeriod === "today" ? "오늘" : lead.grade || "신규",
        tone: "lead" as const,
        grade: (lead.grade || undefined) as "A" | "B" | "C" | undefined,
        x: 0,
        y: 0
      }));
  }, [leads, viewMode]);

  const summary = queues?.summary;

  return (
    <CustomerAppShell
      active="leads-permits"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="사업자 인허가 신규 데이터 기반 영업 후보"
      title="신규 리드"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <section className="mx-auto max-w-[1560px] space-y-3">
        <div className="maju-section-card">
          <SectionHeader
            eyebrow="신규 영업"
            title="신규 리드"
            description="사업자 인허가 신규 데이터를 업로드하면 오늘/이번 주/이번 달 신규 사업장 중 우리 업종에 맞는 곳을 골라 전화·DM·방문 큐로 나눠 보여줍니다."
          />
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="신규 리드" value={summary ? `${summary.active.toLocaleString()}곳` : "—"} helper="제외 제외한 활성 리드" />
            <SummaryCard label="오늘 신규" value={summary ? `${summary.todayNew.toLocaleString()}곳` : "—"} helper="오늘 인허가된 사업장" tone="emerald" />
            <SummaryCard label="A등급" value={summary ? `${summary.gradeA.toLocaleString()}곳` : "—"} helper="추천 점수 85점 이상" tone="blue" />
            <SummaryCard label="전화 가능" value={summary ? `${summary.hasPhone.toLocaleString()}곳` : "—"} helper="전화번호 확인됨" tone="violet" />
          </div>
        </div>

        <UploadPanel
          busy={uploadBusy}
          onFileSelect={(file) => void handleFileUpload(file)}
          open={uploadOpen}
          onToggle={() => setUploadOpen((value) => !value)}
          result={uploadResult}
          warning={uploadWarning}
        />

        <div className="maju-section-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["queues", "list", "map"] as ViewMode[]).map((mode) => (
                <button
                  className={`rounded-md border px-3 py-1.5 text-xs font-black transition ${
                    viewMode === mode ? "border-slate-900 bg-slate-900 text-white" : "border-transparent bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  type="button"
                >
                  {mode === "queues" ? "오늘 할 일" : mode === "list" ? "전체 리스트" : "지도"}
                </button>
              ))}
            </div>
            <button className="maju-button-secondary h-8 text-xs" onClick={loadLeads} type="button">
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>

          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setPeriodFilter(event.target.value as "all" | PermitLeadPeriod)} value={periodFilter}>
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setIndustryFilter(event.target.value)} value={industryFilter}>
                <option value="">업종 전체</option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
                <option value="">액션 전체</option>
                {ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
              <button
                className="ml-auto flex items-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100"
                onClick={() => setShowAdvancedFilters((value) => !value)}
                type="button"
              >
                <ListFilter className="h-3.5 w-3.5" />
                고급 필터
                <ChevronDown className={`h-3.5 w-3.5 transition ${showAdvancedFilters ? "rotate-180" : ""}`} />
              </button>
            </div>
            {showAdvancedFilters ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-2">
                <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setGradeFilter(event.target.value)} value={gradeFilter}>
                  <option value="">추천 등급 전체</option>
                  <option value="A">A등급</option>
                  <option value="B">B등급</option>
                  <option value="C">C등급</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <input checked={hasPhoneOnly} onChange={(event) => setHasPhoneOnly(event.target.checked)} type="checkbox" />
                  연락처 있는 곳만
                </label>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <input checked={!excludeExcluded} onChange={(event) => setExcludeExcluded(!event.target.checked)} type="checkbox" />
                  제외 처리된 리드도 표시
                </label>
              </div>
            ) : null}
          </div>

          {actionMessage ? <p className="mx-3 mt-3 rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{actionMessage}</p> : null}

          <div className="p-3">
            {loadState === "loading" ? (
              <p className="rounded-md border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">신규 리드를 불러오는 중입니다.</p>
            ) : loadState === "error" ? (
              <p className="rounded-md border border-dashed border-rose-200 bg-rose-50 p-8 text-center text-sm font-bold text-rose-700">
                신규 리드를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.
              </p>
            ) : !leads.length ? (
              <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
                <p className="text-sm font-bold text-slate-600">아직 등록된 신규 리드가 없습니다.</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">사업자 인허가 데이터를 업로드하면 여기에 표시됩니다.</p>
              </div>
            ) : viewMode === "map" ? (
              <div className="h-[560px] overflow-hidden rounded-lg border border-slate-200">
                <KakaoAddressMap mapClassName="h-full w-full rounded-none border-0" markers={mapMarkers} onMarkerClick={(marker) => setSelectedLead(leads.find((lead) => lead.id === marker.id) || null)} showList={false} />
              </div>
            ) : viewMode === "list" ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {leads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onSelect={() => setSelectedLead(lead)} />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                <QueueColumn icon={Phone} leads={queues?.callToday || []} onSelect={setSelectedLead} title="오늘 바로 전화" tone="emerald" />
                <QueueColumn icon={MapPin} leads={queues?.visitThisWeek || []} onSelect={setSelectedLead} title="이번 주 방문" tone="blue" />
                <QueueColumn icon={MessageCircle} leads={queues?.dmCandidates || []} onSelect={setSelectedLead} title="DM 발송 후보" tone="violet" />
                <QueueColumn icon={CircleSlash} leads={queues?.needsEnrichment || []} onSelect={setSelectedLead} title="정보 보강 필요" tone="amber" />
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedLead ? (
        <LeadDetailPanel
          lead={selectedLead}
          onAction={runLeadAction}
          onClose={() => setSelectedLead(null)}
          onConvert={convertToCustomer}
        />
      ) : null}
    </CustomerAppShell>
  );
}

function SummaryCard({ helper, label, tone = "slate", value }: { helper: string; label: string; tone?: "slate" | "emerald" | "blue" | "violet"; value: string }) {
  const toneClassName = { blue: "text-blue-700", emerald: "text-emerald-700", slate: "text-slate-950", violet: "text-violet-700" }[tone];
  return (
    <div className="maju-stat-card p-4">
      <p className="maju-muted-label">{label}</p>
      <p className={`mt-2 truncate text-[24px] font-black leading-none ${toneClassName}`}>{value}</p>
      <p className="mt-2 truncate text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function UploadPanel({
  busy,
  onFileSelect,
  onToggle,
  open,
  result,
  warning
}: {
  busy: boolean;
  onFileSelect: (file: File) => void;
  onToggle: () => void;
  open: boolean;
  result: UploadResult | null;
  warning: string;
}) {
  return (
    <div className="maju-section-card">
      <button className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left" onClick={onToggle} type="button">
        <span className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-black text-slate-950">사업자 인허가 데이터 업로드</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-2 p-3">
          <p className="text-xs font-semibold leading-5 text-slate-500">
            공공데이터포털(지방행정 인허가) 또는 자체 수집한 엑셀/CSV 파일을 업로드하세요. 사업장명, 인허가일자, 영업상태명, 업종명, 주소, 소재지전화 컬럼을
            자동으로 인식합니다. 같은 사업자번호는 최신 인허가 상태로 갱신되고, 이미 거래처로 등록된 사업자번호는 자동으로 제외 처리됩니다.
          </p>
          <label className="maju-button-primary inline-flex w-fit cursor-pointer">
            <Upload className="h-4 w-4" />
            {busy ? "업로드 중..." : "파일 선택"}
            <input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFileSelect(file);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          {warning ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{warning}</p> : null}
          {result ? (
            <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">
              <span>총 {result.total.toLocaleString()}행</span>
              <span className="text-emerald-700">신규 {result.inserted.toLocaleString()}</span>
              <span className="text-blue-700">갱신 {result.updated.toLocaleString()}</span>
              <span className="text-slate-500">기존 거래처 중복 {result.duplicates.toLocaleString()}</span>
              <span className="text-slate-500">비활성 제외 {result.excludedInactive.toLocaleString()}</span>
              <span className="text-slate-500">비대상 업종 제외 {result.excludedNonTarget.toLocaleString()}</span>
              {result.skippedNoName ? <span className="text-rose-600">상호명 없음 건너뜀 {result.skippedNoName.toLocaleString()}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QueueColumn({
  icon: Icon,
  leads,
  onSelect,
  title,
  tone
}: {
  icon: typeof Phone;
  leads: PermitLead[];
  onSelect: (lead: PermitLead) => void;
  title: string;
  tone: "emerald" | "blue" | "violet" | "amber";
}) {
  const toneClassName = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800"
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200">
      <div className={`flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2 ${toneClassName}`}>
        <span className="flex items-center gap-1.5 text-xs font-black">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
        <span className="text-xs font-black">{leads.length}곳</span>
      </div>
      <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-2">
        {leads.length ? (
          leads.map((lead) => <LeadCard key={lead.id} lead={lead} onSelect={() => onSelect(lead)} compact />)
        ) : (
          <p className="p-3 text-center text-xs font-semibold text-slate-400">해당하는 리드가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function LeadCard({ compact, lead, onSelect }: { compact?: boolean; lead: PermitLead; onSelect: () => void }) {
  return (
    <button
      className="flex w-full flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-center gap-1.5">
        <Badge className={`px-1.5 py-0 text-[10px] ${gradeToneClassName(lead.grade)}`}>{lead.grade || "-"}</Badge>
        <span className="truncate text-sm font-black text-slate-950">{lead.businessName}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-slate-400">
        <span>{lead.industryPrimary}</span>
        <span>·</span>
        <span>{PERIOD_BADGE_LABEL[lead.leadPeriod]}</span>
        {lead.address ? (
          <>
            <span>·</span>
            <span className="truncate">{lead.address}</span>
          </>
        ) : null}
      </span>
      {!compact && lead.nextActionReasons.length ? (
        <span className="mt-0.5 text-[11px] font-semibold text-slate-500">{lead.nextActionReasons.slice(0, 3).join(" · ")}</span>
      ) : null}
    </button>
  );
}

function LeadDetailPanel({
  lead,
  onAction,
  onClose,
  onConvert
}: {
  lead: PermitLead;
  onAction: (lead: PermitLead, actionType: "call" | "dm" | "visit" | "hold" | "exclude", result?: string) => void;
  onClose: () => void;
  onConvert: (lead: PermitLead) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Badge className={`px-1.5 py-0 text-[10px] ${gradeToneClassName(lead.grade)}`}>{lead.grade ? `${lead.grade}등급` : "등급 미산정"}</Badge>
              <span className="text-[11px] font-black text-slate-400">{PERIOD_BADGE_LABEL[lead.leadPeriod]}</span>
            </span>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{lead.businessName}</h3>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
              {lead.industryPrimary}
              {lead.permitStatus ? ` · ${lead.permitStatus}` : ""}
            </p>
          </div>
          <button aria-label="닫기" className="maju-button-secondary h-8 w-8 shrink-0 px-0" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-600">
            <DetailRow label="주소" value={lead.address || "확인 필요"} />
            <DetailRow label="전화" value={lead.phone || "확인 필요"} />
            <DetailRow label="대표자" value={lead.representativeName || "확인 필요"} />
            <DetailRow label="인허가일" value={lead.permitDate || "확인 필요"} />
            <DetailRow label="관할기관" value={lead.jurisdiction || "확인 필요"} />
          </div>

          {lead.nextActionReasons.length ? (
            <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-teal-700">추천 근거</p>
              <ul className="mt-1.5 space-y-1 text-xs font-bold text-teal-900">
                {lead.nextActionReasons.slice(0, 3).map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lead.isDuplicate || lead.excludeReason ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">제외 사유: {lead.excludeReason}</p>
          ) : null}

          <p className="text-[11px] font-semibold text-slate-400">현재 상태: {lead.status}</p>

          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled={!lead.phone} icon={Phone} label="전화" onClick={() => onAction(lead, "call", "통화 성공")} />
            <ActionButton icon={MessageCircle} label="DM 발송" onClick={() => onAction(lead, "dm")} />
            <ActionButton icon={MapPin} label="방문 예정" onClick={() => onAction(lead, "visit", "다음 방문")} />
            <ActionButton icon={CircleSlash} label="보류" onClick={() => onAction(lead, "hold")} />
          </div>
          <button className="maju-button-primary w-full" onClick={() => onConvert(lead)} type="button">
            <UserCheck className="h-4 w-4" />
            거래처로 전환
          </button>
          <button className="maju-button-secondary w-full text-rose-600" onClick={() => onAction(lead, "exclude", "제외")} type="button">
            영업 제외
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="truncate text-right text-slate-800">{value}</span>
    </p>
  );
}

function ActionButton({ disabled, icon: Icon, label, onClick }: { disabled?: boolean; icon: typeof Phone; label: string; onClick: () => void }) {
  return (
    <button className="maju-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onClick} type="button">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
