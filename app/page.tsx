"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  HeartPulse,
  History,
  Info,
  LucideIcon,
  Save,
  Search,
  Route,
  Sparkles,
  Target,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { CustomerAttachmentUploadPanel } from "@/components/customer-attachment-upload-panel";
import { ExcelHeaderMappingPreview } from "@/components/excel-mapping-preview";
import { InfoTooltip } from "@/components/info-tooltip";
import { Progress } from "@/components/ui/progress";
import { analyzeCompany, AnalysisResult } from "@/lib/analysis";
import { isValidBusinessRegistrationNumber } from "@/lib/business-number";
import { CustomerRow, sampleCustomers, UploadTemplateField, UploadTemplateType, uploadTemplates } from "@/lib/sample-data";

// Report is only shown after analysis finishes, so load it on demand instead
// of shipping it in the data registration page's initial JS bundle.
const Report = dynamic(() => import("@/components/data-registration-report").then((module) => module.Report), {
  loading: () => (
    <div className="maju-empty-state p-8 text-center text-sm font-bold text-slate-500">리포트를 불러오는 중입니다…</div>
  )
});

type RawRow = Record<string, string | number | boolean | null | undefined>;
type FieldMap = Record<string, string>;
const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];
type EntryMode = "document" | "excel" | "manual";
type OcrMeta = {
  confidence: number;
  mode: string;
  provider: string;
  warnings: string[];
};
type PipelineStatus = "pending" | "running" | "done" | "error";
type PipelineStep = {
  key: string;
  label: string;
  description: string;
  status: PipelineStatus;
};
type UploadHistoryRow = {
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
type DataQualitySummary = {
  duplicateCandidates: number;
  invalidBusinessNumbers: Array<{ rowNumber: number; value: string }>;
  issueRows: Array<{ missingLabels: string[]; rowNumber: number }>;
  readyRows: number;
  rows: number;
};
type RegistrationStatus = {
  actionLabel: string;
  description: string;
  nextAction: string;
  status: "idle" | "ready" | "running" | "success" | "warning" | "error";
  title: string;
};
type BusinessSearchResult = {
  address: string;
  industry: string;
  kakaoPlaceUrl: string;
  name: string;
  phone: string;
  roadAddress: string;
};

const emptyMap: FieldMap = {};
const mappingPresetStorageKey = "maju:data-registration:mapping-presets";
const initialPipelineSteps: PipelineStep[] = [
  { key: "file", label: "파일 수신", description: "엑셀 파일과 시트 정보를 확인합니다.", status: "pending" },
  { key: "mapping", label: "필드 매칭", description: "필수 필드와 업로드 컬럼을 연결합니다.", status: "pending" },
  { key: "raw", label: "Raw 데이터 적재", description: "원본 행 데이터를 재분석 가능하게 보존합니다.", status: "pending" },
  { key: "normalize", label: "거래처 정제", description: "거래처명, 주소, 업종, 매출 정보를 표준화합니다.", status: "pending" },
  { key: "score", label: "회사 건강도 계산", description: "영업력, 배송효율, 리스크 점수를 계산합니다.", status: "pending" },
  { key: "report", label: "AI 리포트 생성", description: "회사 현황과 추천 액션을 생성합니다.", status: "pending" }
];
const initialRegistrationStatus: RegistrationStatus = {
  actionLabel: "대기 중",
  description: "엑셀 업로드 또는 수기 입력을 시작하면 저장 가능 여부를 확인합니다.",
  nextAction: "거래처 등록 또는 매출 원장 등록 방식을 선택하세요.",
  status: "idle",
  title: "아직 등록이 시작되지 않았습니다."
};

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function getUploadTypeFromUrl(): UploadTemplateType {
  if (typeof window === "undefined") return "customer-master";
  const value = new URLSearchParams(window.location.search).get("type") || new URLSearchParams(window.location.search).get("uploadType");
  return isUploadTemplateType(value) ? value : "customer-master";
}

export default function Home() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [screen, setScreen] = useState<"briefing" | "onboarding" | "report">("onboarding");
  const [uploadType, setUploadType] = useState<UploadTemplateType>("customer-master");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [manualDraft, setManualDraft] = useState<RawRow>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<FieldMap>(emptyMap);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [uploadedFilename, setUploadedFilename] = useState<string>("등록 전");
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryRow[]>([]);
  const [lastManualCustomerHref, setLastManualCustomerHref] = useState("");
  const [lastManualCustomer, setLastManualCustomer] = useState<{ id: string; name: string } | null>(null);
  const [manualSaveMessage, setManualSaveMessage] = useState("");
  const [isManualSaving, setIsManualSaving] = useState(false);
  // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 서버가 상호명이 같은 기존 거래처를
  // 발견하면 바로 저장하지 않고 여기 담아 사용자에게 확인을 받습니다. "그래도 등록"을 눌러야만
  // confirmDuplicate: true로 다시 저장을 시도합니다.
  const [duplicateNotice, setDuplicateNotice] = useState<{ name: string; matches: Array<{ customerName: string; address: string }>; row: RawRow } | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(initialPipelineSteps);
  const [pipelineMeta, setPipelineMeta] = useState({ rows: 0, qualityScore: 0, persisted: false });
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>(initialRegistrationStatus);

  const analysis = useMemo(() => analyzeCompany(customers), [customers]);
  const currentTemplate = uploadTemplates[uploadType];
  const dashboardHref = adminCompanyId ? `/dashboard?companyId=${encodeURIComponent(adminCompanyId)}` : "/dashboard";
  const reportLedgerHref = adminCompanyId
    ? `${uploadType === "customer-master" ? "/crm/timeline" : "/revenue/transactions"}?companyId=${encodeURIComponent(adminCompanyId)}`
    : uploadType === "customer-master"
      ? "/crm/timeline"
      : "/revenue/transactions";
  const routeHref = adminCompanyId ? `/dashboard?companyId=${encodeURIComponent(adminCompanyId)}` : "/dashboard";
  const mobileTodayHref = adminCompanyId ? `/mobile/today?companyId=${encodeURIComponent(adminCompanyId)}` : "/mobile/today";

  useEffect(() => {
    refreshUploadHistory();
  }, []);

  useEffect(() => {
    const requestedUploadType = getUploadTypeFromUrl();
    setUploadType(requestedUploadType);
    setFieldMap(autoMapHeaders(headers, uploadTemplates[requestedUploadType].fields));
    setScreen("onboarding");
  }, []);

  function downloadTemplate(type: UploadTemplateType) {
    const templateRows = buildTemplateWorkbookRows(type);
    downloadWorkbook(`maju_${uploadTemplates[type].label}_양식_${dateStamp()}.xlsx`, [
      { name: "입력 양식", rows: templateRows.dataRows },
      { name: "컬럼 가이드", rows: templateRows.guideRows }
    ]);
  }

  function downloadCustomerExport() {
    downloadWorkbook(`maju_거래처_마스터_내보내기_${dateStamp()}.xlsx`, [
      { name: "거래처 마스터", rows: buildCustomerExportRows(customers, rawRows, fieldMap) }
    ]);
  }

  function downloadSalesExport() {
    downloadWorkbook(`maju_매출_거래내역_내보내기_${dateStamp()}.xlsx`, [
      { name: "매출 거래내역", rows: buildSalesExportRows(uploadType === "sales-analysis" ? rawRows : []) }
    ]);
  }

  function startUploadFlow(nextType: UploadTemplateType) {
    setUploadType(nextType);
    setFieldMap(autoMapHeaders(headers, uploadTemplates[nextType].fields));
    setScreen("onboarding");
  }

  function generateCurrentReport() {
    if (!customers.length) {
      setRegistrationStatus({
        actionLabel: "등록 데이터 필요",
        description: "AI 리포트는 저장된 거래처와 매출 원장을 기준으로 생성합니다.",
        nextAction: "거래처를 수기 등록하거나 엑셀로 업로드한 뒤 저장 상태를 확인하세요.",
        status: "warning",
        title: "아직 리포트로 만들 운영 데이터가 없습니다."
      });
      setScreen("onboarding");
      return;
    }
    runPipeline(customers, rawRows, fieldMap, uploadedFilename || "registered-customers");
  }

  function runAnalysis() {
    setIsAnalyzing(true);
    setScreen("onboarding");
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setScreen("report");
    }, 950);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setRegistrationStatus({
      actionLabel: "파일 확인 중",
      description: `${file.name} 파일을 읽고 첫 번째 시트의 헤더를 확인하고 있습니다.`,
      nextAction: "잠시만 기다려 주세요.",
      status: "running",
      title: "엑셀 파일을 불러오는 중입니다."
    });

    try {
      const json = await parseUploadRows(file);
      const nextHeaders = Object.keys(json[0] || {});

      if (!json.length || !nextHeaders.length) {
        setRegistrationStatus({
          actionLabel: "파일 확인 실패",
          description: "선택한 엑셀에서 데이터 행 또는 헤더를 찾지 못했습니다.",
          nextAction: "첫 번째 시트에 헤더와 데이터가 있는지 확인한 뒤 다시 업로드하세요.",
          status: "error",
          title: "등록할 행이 없습니다."
        });
        return;
      }

      const nextFieldMap = autoMapHeaders(nextHeaders, currentTemplate.fields);
      const requiredCount = currentTemplate.fields.filter((field) => field.required).length;
      const mappedCount = currentTemplate.fields.filter((field) => field.required && nextFieldMap[field.key]).length;

      setRawRows(json);
      setHeaders(nextHeaders);
      setFieldMap(nextFieldMap);
      setUploadedFilename(file.name);
      setRegistrationStatus({
        actionLabel: "파일 수신 완료",
        description: `${json.length.toLocaleString()}개 행과 ${nextHeaders.length.toLocaleString()}개 컬럼을 확인했습니다. 필수 필드 ${mappedCount}/${requiredCount}개가 자동 연결됐습니다.`,
        nextAction: mappedCount === requiredCount ? "데이터 검수 후 저장하고 리포트를 갱신하세요." : "필드 매칭에서 필수 필드를 연결하세요.",
        status: mappedCount === requiredCount ? "ready" : "warning",
        title: mappedCount === requiredCount ? "저장 준비가 거의 완료됐습니다." : "필수 필드 매칭이 더 필요합니다."
      });
    } catch (error) {
      setRegistrationStatus({
        actionLabel: "파일 읽기 실패",
        description: error instanceof Error ? error.message : "엑셀 파일을 읽는 중 오류가 발생했습니다.",
        nextAction: "파일 형식이 .xlsx 또는 .csv인지 확인하고 다시 시도하세요.",
        status: "error",
        title: "업로드를 완료하지 못했습니다."
      });
    } finally {
      event.target.value = "";
    }
  }

  // 실제 서버 저장 요청(및 결과 처리)만 따로 뗀 헬퍼입니다. 최초 저장 시도와, 중복 확인 후
  // "그래도 등록"으로 재시도할 때 둘 다 이 함수를 씁니다 — 재시도할 때는 검수 목록에 행을
  // 또 추가하면 안 되므로(saveManualEntry 쪽 로직과 분리) 여기서는 순수하게 저장 요청만 합니다.
  async function submitCustomerRow(nextRow: RawRow, confirmDuplicate: boolean) {
    const response = await fetch(customerMasterEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildManualCustomerPayload(nextRow), confirmDuplicate })
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;

    if (response?.ok && payload?.possibleDuplicate) {
      // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 상호명이 같은 거래처가 이미 있으면
      // 바로 저장하지 않고 사용자 확인을 기다립니다.
      setDuplicateNotice({
        matches: Array.isArray(payload.duplicateMatches) ? payload.duplicateMatches : [],
        name: String(nextRow.customerName || nextRow.name || "신규 거래처"),
        row: nextRow
      });
      setManualSaveMessage("이름이 같은 거래처가 이미 있습니다. 아래에서 확인 후 등록 여부를 선택하세요.");
      setRegistrationStatus({
        actionLabel: "중복 확인 필요",
        description: "이름이 같은 거래처가 이미 등록되어 있어 저장을 잠시 멈췄습니다.",
        nextAction: "같은 거래처면 거래처 관리에서 확인하고, 다른 곳이면 '그래도 등록'을 누르세요.",
        status: "warning",
        title: "중복 의심 거래처를 확인하세요."
      });
      return;
    }

    if (response?.ok) {
      setDuplicateNotice(null);
      const customerId = String(payload?.customer?.id || "");
      setLastManualCustomerHref(customerId ? customerHistoryHref(customerId) : "/crm/timeline");
      setLastManualCustomer(customerId ? { id: customerId, name: String(nextRow.customerName || nextRow.name || "신규 거래처") } : null);
      setManualSaveMessage(payload?.persisted === false ? "검수 목록에는 반영됐습니다. 저장 상태는 관리자 시스템 점검에서 확인하세요." : "저장했습니다. 거래처 히스토리에서 바로 확인할 수 있습니다.");
      setRegistrationStatus({
        actionLabel: payload?.persisted === false ? "저장 확인" : "저장 완료",
        description: payload?.persisted === false ? "입력값은 화면에 반영됐지만 저장 여부는 추가 확인이 필요합니다." : "거래처 원장에 저장됐고 히스토리 화면에서 확인할 수 있습니다.",
        nextAction: customerId ? "히스토리에서 확인하거나 추가 거래처를 계속 등록하세요." : "거래처 히스토리 화면에서 저장 결과를 확인하세요.",
        status: payload?.persisted === false ? "warning" : "success",
        title: payload?.persisted === false ? "저장 확인이 필요합니다." : "수기 등록이 완료됐습니다."
      });
      await refreshUploadHistory();
    } else if (response?.status === 401) {
      setManualSaveMessage("검수 목록에는 반영됐습니다. 저장은 고객사 또는 관리자 로그인 후 가능합니다.");
      setRegistrationStatus({
        actionLabel: "로그인 필요",
        description: "화면의 검수 목록에는 추가됐지만, 저장 API가 로그인을 요구했습니다.",
        nextAction: "고객사 또는 관리자 계정으로 로그인한 뒤 다시 저장하세요.",
        status: "warning",
        title: "저장이 아직 완료되지 않았습니다."
      });
    } else {
      setManualSaveMessage(payload?.message ? `검수 목록에는 반영됐습니다. 저장 확인: ${payload.message}` : "검수 목록에는 반영됐습니다. 저장은 나중에 다시 시도하세요.");
      setRegistrationStatus({
        actionLabel: "저장 확인 필요",
        description: payload?.message || "저장 완료 응답을 확인하지 못했습니다.",
        nextAction: "입력값을 확인한 뒤 다시 저장하거나 관리자 시스템 상태를 확인하세요.",
        status: "warning",
        title: "저장 확인이 필요합니다."
      });
    }
  }

  async function confirmDuplicateAndSave() {
    if (!duplicateNotice || isManualSaving) return;
    setIsManualSaving(true);
    try {
      await submitCustomerRow(duplicateNotice.row, true);
    } catch (error) {
      setRegistrationStatus({
        actionLabel: "저장 실패",
        description: error instanceof Error ? error.message : "수기 저장 중 오류가 발생했습니다.",
        nextAction: "네트워크와 로그인 상태를 확인한 뒤 다시 시도하세요.",
        status: "error",
        title: "수기 등록을 완료하지 못했습니다."
      });
    } finally {
      setIsManualSaving(false);
    }
  }

  async function saveManualEntry() {
    // 사업자등록번호는 입력했을 때만 형식을 검증합니다. 지도 검색으로 찾은 미등록 매장을
    // 현장에서 빠르게 등록할 때는 사업자등록증이 아직 없을 수 있으므로 번호 없이도 저장할 수 있어야 합니다.
    const manualBusinessNumberInput = String(manualDraft.businessRegistrationNumber ?? "").trim();
    if (uploadType === "customer-master" && manualBusinessNumberInput && !isValidBusinessRegistrationNumber(manualBusinessNumberInput)) return;

    setIsManualSaving(true);
    setLastManualCustomerHref("");
    setLastManualCustomer(null);
    setDuplicateNotice(null);
    const nextHeaders = currentTemplate.fields.map((field) => field.key);
    const nextRow = currentTemplate.fields.reduce<RawRow>((row, field) => {
      row[field.key] = field.key === "businessRegistrationNumber" ? formatBusinessRegistrationNumber(String(manualDraft[field.key] ?? "")) : manualDraft[field.key] ?? "";
      return row;
    }, {});
    const nextRows = [...rawRows, nextRow];

    setRawRows(nextRows);
    setHeaders(nextHeaders);
    setFieldMap(createIdentityFieldMap(currentTemplate.fields));
    setUploadedFilename(`${currentTemplate.label}-manual`);
    setManualSaveMessage("검수 목록에 추가했습니다. 저장 상태를 확인 중입니다.");
    setRegistrationStatus({
      actionLabel: "수기 등록 저장 중",
      description: `${String(nextRow.customerName || nextRow.name || "신규 거래처")} 정보를 검수 목록에 추가하고 저장 결과를 확인하고 있습니다.`,
      nextAction: "저장 결과를 확인 중입니다.",
      status: "running",
      title: "수기 입력값을 처리하고 있습니다."
    });

    try {
      if (uploadType === "customer-master") {
        await submitCustomerRow(nextRow, false);
      }
    } catch (error) {
      setRegistrationStatus({
        actionLabel: "저장 실패",
        description: error instanceof Error ? error.message : "수기 저장 중 오류가 발생했습니다.",
        nextAction: "네트워크와 로그인 상태를 확인한 뒤 다시 시도하세요.",
        status: "error",
        title: "수기 등록을 완료하지 못했습니다."
      });
    } finally {
      setIsManualSaving(false);
      setManualDraft({});
    }
  }

  async function analyzeUploadedRows() {
    setRegistrationStatus({
      actionLabel: "리포트 갱신 시작",
      description: `${rawRows.length.toLocaleString()}개 원본 행을 정제하고 저장을 시도합니다.`,
      nextAction: "파이프라인 단계가 모두 완료될 때까지 기다려 주세요.",
      status: "running",
      title: "데이터 업데이트를 시작했습니다."
    });
    const mapped = uploadType === "sales-analysis" ? mapSalesRowsToCustomers(rawRows, fieldMap) : mapMasterRowsToCustomers(rawRows, fieldMap);
    if (!mapped.length) {
      setRegistrationStatus({
        actionLabel: "정제 결과 없음",
        description: "업로드 행은 있지만 거래처명, 주소, 매출 등 표준 필드로 변환된 데이터가 없습니다.",
        nextAction: "필드 매칭과 데이터 검수를 다시 확인한 뒤 저장을 실행하세요.",
        status: "warning",
        title: "리포트를 생성할 거래처 데이터가 없습니다."
      });
      return;
    }

    const nextRows = mapped;
    setCustomers(nextRows);
    await runPipeline(nextRows, rawRows, fieldMap, uploadedFilename);
  }

  async function runPipeline(nextRows: CustomerRow[], nextRawRows: RawRow[], nextFieldMap: FieldMap, nextFilename: string) {
    setIsAnalyzing(true);
    setScreen("onboarding");
    setPipelineSteps(resetPipelineSteps());
    setPipelineMeta({ rows: nextRows.length, qualityScore: 0, persisted: false });

    await completePipelineStep("file");
    await completePipelineStep("mapping");
    await completePipelineStep("raw");
    await completePipelineStep("normalize");
    await completePipelineStep("score");

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorName: "정두영",
        columnMapping: nextFieldMap,
        companyId: getAdminCompanyIdFromUrl(),
        companyName: nextRows[0]?.companyName || "업로드 고객사",
        originalFilename: nextFilename,
        rawRows: nextRawRows,
        rows: nextRows,
        uploadType
      })
    }).catch(() => null);

    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      const persisted = Boolean(payload?.persisted);
      setPipelineMeta({
        rows: payload?.pipeline?.rows || nextRows.length,
        qualityScore: payload?.pipeline?.qualityScore || 0,
        persisted
      });
      // 2026-08-28 피드백 대응: 빈 상호명 행을 건너뛰었거나(skippedRowNumbers), 이름이 같은
      // 다른 거래처가 있어 저장을 보류한 행(duplicateWarnings)이 있으면 조용히 넘어가지 않고
      // 결과 화면에 구체적으로 알려줍니다.
      const skippedRowNumbers: number[] = Array.isArray(payload?.pipeline?.skippedRowNumbers) ? payload.pipeline.skippedRowNumbers : [];
      const duplicateWarnings: Array<{ rowNumber: number; customerName: string; matches: Array<{ customerName: string; address: string }> }> = Array.isArray(
        payload?.pipeline?.duplicateWarnings
      )
        ? payload.pipeline.duplicateWarnings
        : [];
      const warningLines: string[] = [];
      if (skippedRowNumbers.length) {
        warningLines.push(`상호명이 비어 있어 ${skippedRowNumbers.length}개 행(${skippedRowNumbers.slice(0, 10).join(", ")}${skippedRowNumbers.length > 10 ? " 외" : ""})을 건너뛰었습니다.`);
      }
      if (duplicateWarnings.length) {
        const names = duplicateWarnings
          .slice(0, 5)
          .map((warning) => `${warning.rowNumber}행 "${warning.customerName}"(기존: ${warning.matches[0]?.customerName || ""} ${warning.matches[0]?.address || ""})`)
          .join(" · ");
        warningLines.push(
          `이름이 같은 거래처가 이미 있어 ${duplicateWarnings.length}개 행을 저장하지 않았습니다: ${names}${duplicateWarnings.length > 5 ? " 외" : ""}. 거래처 관리에서 직접 확인 후 등록하세요.`
        );
      }
      const hasWarnings = warningLines.length > 0;
      setRegistrationStatus({
        actionLabel: persisted ? (hasWarnings ? "저장 완료 · 확인 필요" : "저장 완료") : "분석 완료 · 저장 확인 필요",
        description: persisted
          ? [`${nextFilename} 데이터가 저장되고 AI 리포트가 갱신됐습니다.`, ...warningLines].join(" ")
          : "분석은 완료됐지만 저장 결과가 확인되지 않았습니다.",
        nextAction: persisted ? "AI 리포트와 거래처 히스토리, 매출 원장에서 결과를 확인하세요." : "로그인/운영 환경값을 확인한 뒤 다시 저장을 시도하세요.",
        status: persisted ? (hasWarnings ? "warning" : "success") : "warning",
        title: persisted ? (hasWarnings ? "데이터가 저장됐지만 확인할 항목이 있습니다." : "데이터 등록이 완료됐습니다.") : "분석은 됐지만 저장 확인이 필요합니다."
      });
      await completePipelineStep("report");
    } else {
      const payload = response ? await response.json().catch(() => null) : null;
      setPipelineMeta({ rows: nextRows.length, qualityScore: 0, persisted: false });
      setPipelineSteps((steps) => steps.map((step) => (step.key === "report" ? { ...step, status: "error" } : step)));
      setRegistrationStatus({
        actionLabel: response?.status === 401 ? "로그인 필요" : "저장 실패",
        description: payload?.message || payload?.error || "저장 API가 완료 응답을 주지 않았습니다.",
        nextAction: response?.status === 401 ? "고객사 또는 관리자 계정으로 로그인한 뒤 다시 리포트를 갱신하세요." : "관리자 시스템 상태와 저장 연결을 확인하세요.",
        status: response?.status === 401 ? "warning" : "error",
        title: "데이터 저장 확인이 필요합니다."
      });
    }

    await refreshUploadHistory();
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setScreen("report");
    }, 120);
  }

  async function refreshUploadHistory() {
    const response = await fetch(uploadHistoryEndpoint(), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.uploads)) setUploadHistory(payload.uploads);
  }

  async function completePipelineStep(key: string) {
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "running" } : step)));
    await wait(12);
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "done" } : step)));
    await wait(4);
  }

  return (
    <CustomerAppShell
      active="data"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="아직 없는 거래처 또는 매출 데이터를 새로 등록합니다."
      title="거래처 관리 · 등록"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <div className="mx-auto max-w-[1880px] space-y-3">
        <WorkspaceModeTabs active={screen} hasReport={pipelineMeta.rows > 0} onMove={setScreen} />
        {screen === "briefing" && <Briefing analysis={analysis} onStart={startUploadFlow} onGenerateReport={generateCurrentReport} />}
        {screen === "onboarding" && (
          <Onboarding
            headers={headers}
            fieldMap={fieldMap}
            uploadType={uploadType}
            template={currentTemplate}
            manualDraft={manualDraft}
            rawRows={rawRows}
            uploadedFilename={uploadedFilename}
            isAnalyzing={isAnalyzing}
            pipelineMeta={pipelineMeta}
            pipelineSteps={pipelineSteps}
            registrationStatus={registrationStatus}
            uploadHistory={uploadHistory}
            isManualSaving={isManualSaving}
            lastManualCustomerHref={lastManualCustomerHref}
            lastManualCustomer={lastManualCustomer}
            manualSaveMessage={manualSaveMessage}
            duplicateNotice={duplicateNotice}
            onCancelDuplicate={() => setDuplicateNotice(null)}
            onConfirmDuplicate={confirmDuplicateAndSave}
            onFile={handleFile}
            onMap={setFieldMap}
            onUploadType={(nextType) => {
              setUploadType(nextType);
              setFieldMap(autoMapHeaders(headers, uploadTemplates[nextType].fields));
              setManualDraft({});
            }}
            onManualChange={setManualDraft}
            onManualSave={saveManualEntry}
            onAnalyze={analyzeUploadedRows}
            onDownloadTemplate={downloadTemplate}
            onDownloadCustomerExport={downloadCustomerExport}
            onDownloadSalesExport={downloadSalesExport}
          />
        )}
        {screen === "report" && (
          <Report
            analysis={analysis}
            dashboardHref={dashboardHref}
            ledgerHref={reportLedgerHref}
            meta={pipelineMeta}
            mobileHref={mobileTodayHref}
            onReset={() => setScreen("onboarding")}
            routeHref={routeHref}
            uploadType={uploadType}
          />
        )}
      </div>
    </CustomerAppShell>
  );
}

function useAdminCompanyId() {
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    setCompanyId(getAdminCompanyIdFromUrl());
  }, []);

  return companyId;
}

function WorkspaceModeTabs({
  active,
  hasReport,
  onMove
}: {
  active: string;
  hasReport: boolean;
  onMove: (screen: "briefing" | "onboarding" | "report") => void;
}) {
  const tabs = [
    ["briefing", "등록 가이드"],
    ["onboarding", "데이터 등록"],
    ["report", "AI 리포트"]
  ] as const;
  const copy = {
    briefing: ["등록 가이드", "기초정보는 1회 저장하고 매출 원장은 반복 업데이트합니다."],
    onboarding: ["데이터 작업공간", "수기 등록, 엑셀 업로드, ERP 필드 매칭을 한 화면에서 처리합니다."],
    report: ["AI 리포트", "저장된 거래처와 매출 기준으로 회사 현황 리포트를 생성합니다."]
  }[active as "briefing" | "onboarding" | "report"] || ["데이터 작업공간", "거래처와 매출 데이터를 운영 기준값으로 관리합니다."];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-black text-slate-950">{copy[0]}</p>
        <InfoTooltip text={copy[1]} />
      </div>
      <div className="grid w-full gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 sm:w-auto sm:grid-cols-3">
        {tabs.map(([key, label]) => {
          const disabled = key === "report" && !hasReport;
          return (
          <button
            key={key}
            className={`h-9 min-w-[104px] rounded px-3 text-left transition ${
              disabled
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : active === key
                  ? "bg-teal-700 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-950"
            }`}
            disabled={disabled}
            onClick={() => onMove(key)}
            type="button"
            title={disabled ? "거래처 또는 매출 데이터를 저장한 뒤 리포트를 확인할 수 있습니다." : undefined}
          >
            <span className="block text-xs font-black">{label}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function Briefing({
  analysis,
  onStart,
  onGenerateReport
}: {
  analysis: AnalysisResult;
  onStart: (type: UploadTemplateType) => void;
  onGenerateReport: () => void;
}) {
  const guideSteps = [
    ["01", "회사 기준값 확인", "회사명, 물류 출발지, 담당자, 배송권역을 먼저 정리합니다.", "회사 설정"],
    ["02", "거래처 등록", "사업자번호, 대표자, 배송주소, 연락처, 적재위치 자료를 저장합니다.", "기초 등록"],
    ["03", "매출 원장 업데이트", "ERP 원장을 업로드하고 거래처와 매출 컬럼을 매칭합니다.", "반복 업데이트"],
    ["04", "검증 후 리포트 갱신", "누락값과 사업자번호 형식을 확인한 뒤 AI 리포트를 갱신합니다.", "리포트 생성"]
  ] as const;
  const dataSets = [
    {
      action: () => onStart("customer-master" as UploadTemplateType),
      badge: "최초 1회 + 변경 시",
      description: "거래처 히스토리, 지도, 배송 코스의 기준 데이터입니다.",
      fields: ["사업자등록번호", "거래처명", "배송주소", "대표자명", "연락처", "첨부자료"],
      icon: Building2,
      title: "매장 및 거래처 기본정보"
    },
    {
      action: () => onStart("sales-analysis" as UploadTemplateType),
      badge: "일/월/분기 반복",
      description: "매출 등급, 이탈 감지, 신규 영업 전략의 기준 데이터입니다.",
      fields: ["거래처 key", "매출일자", "품목", "수량", "공급가", "총매출"],
      icon: FileSpreadsheet,
      title: "매출 원장"
    }
  ] as const;
  const validationRows = [
    ["사업자번호", "10자리 형식 검증 후 저장, API로 휴폐업 상태 매일 조회"],
    ["주소", "카카오 주소 검색으로 표준화하고 지도 좌표와 배송거리 계산에 사용"],
    ["거래처 key", "ERP별 다른 헤더라도 사업자번호 또는 거래처명으로 매출과 연결"],
    ["첨부자료", "사업자등록증, 통장사본, 배송 적재위치 사진/영상 보관"]
  ] as const;
  const reportOutcomes = [
    ["거래처 현황", `${analysis.customers}곳`, "전체 거래처, 등급, 사업자 상태"],
    ["배송 운영", `${analysis.avgDeliveryKm.toFixed(1)}km`, "출발지 기준 이동거리와 권역"],
    ["신규 기회", `${analysis.newOpportunities}곳`, "White Space와 영업 후보"],
    ["회사 건강도", `${analysis.health.total}점`, "영업력, 배송효율, 리스크"]
  ];

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <Badge className="mb-4 bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">등록 가이드</Badge>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">처음 등록은 어렵지 않게, 이후 업데이트는 반복 가능하게</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                엑셀 업로드는 등록 방법 중 하나입니다. 핵심은 거래처 기본정보를 회사의 기준 데이터로 저장하고, 매출 원장을 주기적으로 업데이트해서
                현황판과 AI 리포트가 계속 갱신되도록 만드는 것입니다.
              </p>
            </div>
            <div className="grid gap-2">
              <Button onClick={() => onStart("customer-master")}>
                <Building2 size={17} />
                거래처 등록 시작
              </Button>
              <Button variant="outline" onClick={() => onStart("sales-analysis")}>
                <FileSpreadsheet size={17} />
                매출 업데이트 시작
              </Button>
              <Button variant="accent" onClick={onGenerateReport}>
                <Sparkles size={17} />
                현재 데이터로 리포트 생성
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500">등록 후 생성되는 결과</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {reportOutcomes.map(([label, value, hint]) => (
              <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {guideSteps.map(([step, title, description, tag]) => (
          <div key={step} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-teal-700">{step}</span>
              <Badge className="bg-slate-100 text-slate-700">{tag}</Badge>
            </div>
            <p className="mt-4 text-base font-black text-slate-950">{title}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {dataSets.map((dataSet) => {
            const Icon = dataSet.icon;
            return (
              <div key={dataSet.title} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-lg font-black text-slate-950">{dataSet.title}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{dataSet.description}</p>
                    </div>
                  </div>
                  <Badge className="whitespace-nowrap bg-emerald-50 text-emerald-700">{dataSet.badge}</Badge>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {dataSet.fields.map((field) => (
                    <div key={field} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {field}
                    </div>
                  ))}
                </div>
                <Button className="mt-5 w-full" variant="outline" onClick={dataSet.action}>
                  이 데이터 등록하기
                  <ArrowRight size={17} />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-teal-700" />
            <p className="text-lg font-black text-slate-950">저장 전 검증 기준</p>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">ERP 양식이 달라도 아래 기준으로 정규화하면 같은 원장 구조에 저장됩니다.</p>
          <div className="mt-5 space-y-3">
            {validationRows.map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-950">{label}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-teal-100 bg-teal-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-teal-950">권장 순서</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-teal-800">회사 설정 → 거래처 등록 → 매출 갱신 → 리포트 확인 → 코스 운영</p>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-black text-white transition hover:bg-teal-800" href="/crm/timeline">
            거래처 히스토리 보기
          </Link>
        </div>
      </div>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function AddressMapPanel({
  markers
}: {
  markers: ReadonlyArray<{ readonly address: string; readonly label: string; readonly name: string; readonly tone: "customer" | "lead" | "origin"; readonly x: number; readonly y: number }>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="relative min-h-80 bg-[linear-gradient(90deg,rgba(15,118,110,0.10)_1px,transparent_1px),linear-gradient(180deg,rgba(15,118,110,0.10)_1px,transparent_1px)] bg-[size:42px_42px]">
        <div className="absolute left-[10%] top-[20%] h-[62%] w-[74%] rounded-[40%] border-2 border-dashed border-primary/25" />
        <div className="absolute left-[24%] top-[28%] h-[44%] w-[58%] rounded-[48%] border border-accent/60 bg-accent/10" />
        <div className="absolute left-[42%] top-[31%] h-[2px] w-[30%] rotate-[28deg] bg-primary/30" />
        <div className="absolute left-[55%] top-[44%] h-[2px] w-[20%] rotate-[42deg] bg-primary/30" />
        <div className="absolute left-[30%] top-[42%] h-[2px] w-[44%] rotate-[18deg] bg-primary/20" />
        {markers.map((marker) => (
          <div
            key={marker.name}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          >
            <span
              className={
                marker.tone === "origin"
                  ? "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-foreground text-xs font-black text-white shadow-panel"
                  : marker.tone === "lead"
                    ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-accent text-xs font-black text-foreground shadow-panel"
                    : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary text-xs font-black text-white shadow-panel"
              }
            >
              {marker.label}
            </span>
            <div className="pointer-events-none absolute left-1/2 top-10 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs shadow-panel group-hover:block">
              <p className="font-black text-foreground">{marker.name}</p>
              <p className="mt-1 leading-5 text-muted-foreground">{marker.address}</p>
            </div>
          </div>
        ))}
        <div className="absolute bottom-3 left-3 rounded-md border border-border bg-white/95 p-3 text-xs shadow-panel">
          <p className="font-black">주소 기반 지도 시각화</p>
          <p className="mt-1 text-muted-foreground">출발지, 거래처, 신규 리드 위치를 운영 기준 좌표로 표시합니다.</p>
        </div>
      </div>
      <div className="grid gap-2 border-t border-border p-3 text-xs sm:grid-cols-3">
        <span className="inline-flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full bg-foreground" />출발지</span>
        <span className="inline-flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full bg-primary" />거래처</span>
        <span className="inline-flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full bg-accent" />신규 리드</span>
      </div>
    </div>
  );
}

type DataRegistrationSection = "customer" | "sales" | "history";

function DataRegistrationSidePanel({
  activeSection,
  customerRows,
  onSelect,
  persisted,
  salesRows
}: {
  activeSection: DataRegistrationSection;
  customerRows: number;
  onSelect: (section: DataRegistrationSection) => void;
  persisted: boolean;
  salesRows: number;
}) {
  const items: Array<{ badge?: string; description: string; icon: LucideIcon; key: DataRegistrationSection; label: string; step: string }> = [
    {
      badge: customerRows ? `${customerRows.toLocaleString()}행` : undefined,
      description: "기준값",
      icon: Building2,
      key: "customer",
      label: "거래처 등록",
      step: "1"
    },
    {
      badge: salesRows ? `${salesRows.toLocaleString()}행` : undefined,
      description: "반복 갱신",
      icon: FileSpreadsheet,
      key: "sales",
      label: "매출 등록",
      step: "2"
    },
    {
      badge: persisted ? "반영완료" : undefined,
      description: "저장 확인",
      icon: Save,
      key: "history",
      label: "저장·이력",
      step: "3"
    }
  ];

  return (
    <nav className="maju-section-card h-fit space-y-1 p-2 lg:sticky lg:top-20 lg:self-start">
      <div className="px-2 pb-2 pt-1">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">진행 요약</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">기초정보 저장 후 매출 원장을 반복 갱신합니다.</p>
      </div>
      {items.map((item) => {
        const selected = activeSection === item.key;
        return (
          <button
            key={item.key}
            className={`maju-nav-item w-full text-left ${selected ? "maju-nav-item-active" : "maju-nav-item-idle"}`}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-black ${selected ? "bg-white/10 text-white ring-1 ring-inset ring-white/20" : "bg-slate-100 text-slate-500"}`}>
              {item.step}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <item.icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
                <span className="block truncate text-sm font-black">{item.label}</span>
              </span>
              <span className={`block truncate text-[11px] font-bold ${selected ? "text-white/70" : "text-slate-400"}`}>{item.description}</span>
            </span>
            {item.badge ? (
              <Badge className={selected ? "shrink-0 bg-white px-1.5 py-0 text-[10px] text-slate-950 ring-1 ring-inset ring-white/70" : "shrink-0 bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600 ring-1 ring-inset ring-slate-200"}>
                {item.badge}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function DataRegistrationFlowBar({
  activeSection,
  canAnalyze,
  customerRows,
  onSelect,
  persisted,
  salesRows
}: {
  activeSection: DataRegistrationSection;
  canAnalyze: boolean;
  customerRows: number;
  onSelect: (section: DataRegistrationSection) => void;
  persisted: boolean;
  salesRows: number;
}) {
  const steps: Array<{
    description: string;
    icon: LucideIcon;
    key: DataRegistrationSection;
    label: string;
    ready: boolean;
    value: string;
  }> = [
    {
      description: "회사 운영 기준값",
      icon: Building2,
      key: "customer",
      label: "거래처 등록",
      ready: customerRows > 0 || persisted,
      value: customerRows ? `${customerRows.toLocaleString()}행` : "필수"
    },
    {
      description: "ERP 거래원장 갱신",
      icon: FileSpreadsheet,
      key: "sales",
      label: "매출 등록",
      ready: salesRows > 0 || persisted,
      value: salesRows ? `${salesRows.toLocaleString()}행` : "업데이트"
    },
    {
      description: "저장 결과와 원장 확인",
      icon: Save,
      key: "history",
      label: "저장·이력",
      ready: persisted,
      value: persisted ? "저장 완료" : canAnalyze ? "저장 가능" : "대기"
    }
  ];

  return (
    <section className="maju-section-card p-2">
      <div className="mb-2 flex flex-col gap-1 px-2 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">작업 선택</p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">거래처, 매출, 저장 상태를 한 번에 전환합니다.</p>
        </div>
        <Badge className={persisted ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100" : canAnalyze ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100" : "bg-slate-100 text-slate-600"}>
          {persisted ? "저장 완료" : canAnalyze ? "저장 가능" : "입력 대기"}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const selected = activeSection === step.key;
          return (
            <button
              className={`group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]"
                  : step.ready
                    ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
              key={step.key}
              onClick={() => onSelect(step.key)}
              type="button"
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  selected ? "bg-white/10 text-white ring-1 ring-inset ring-white/20" : step.ready ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ring-inset ${selected ? "bg-white/10 text-white/80 ring-white/20" : "bg-white/70 text-slate-500 ring-slate-200"}`}>
                    {index + 1}
                  </span>
                  <span className={`truncate text-sm font-black ${selected ? "text-white" : "text-slate-950"}`}>{step.label}</span>
                </span>
                <span className={`mt-0.5 block truncate text-[11px] font-bold ${selected ? "text-white/70" : "text-slate-500"}`}>{step.description}</span>
              </span>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-black ${
                  selected
                    ? "bg-white text-slate-950 ring-1 ring-inset ring-white/70"
                    : step.ready
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {step.value}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Onboarding({
  headers,
  fieldMap,
  uploadType,
  template,
  manualDraft,
  rawRows,
  uploadedFilename,
  uploadHistory,
  isAnalyzing,
  pipelineMeta,
  pipelineSteps,
  registrationStatus,
  isManualSaving,
  lastManualCustomerHref,
  lastManualCustomer,
  manualSaveMessage,
  duplicateNotice,
  onCancelDuplicate,
  onConfirmDuplicate,
  onFile,
  onMap,
  onUploadType,
  onManualChange,
  onManualSave,
  onAnalyze,
  onDownloadTemplate,
  onDownloadCustomerExport,
  onDownloadSalesExport
}: {
  headers: string[];
  fieldMap: FieldMap;
  uploadType: UploadTemplateType;
  template: { label: string; description: string; fields: readonly UploadTemplateField[] };
  manualDraft: RawRow;
  rawRows: RawRow[];
  uploadedFilename: string;
  uploadHistory: UploadHistoryRow[];
  isAnalyzing: boolean;
  pipelineMeta: { rows: number; qualityScore: number; persisted: boolean };
  pipelineSteps: PipelineStep[];
  registrationStatus: RegistrationStatus;
  isManualSaving: boolean;
  lastManualCustomerHref: string;
  lastManualCustomer: { id: string; name: string } | null;
  manualSaveMessage: string;
  duplicateNotice: { name: string; matches: Array<{ customerName: string; address: string }> } | null;
  onCancelDuplicate: () => void;
  onConfirmDuplicate: () => void | Promise<void>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onMap: (map: FieldMap) => void;
  onUploadType: (type: UploadTemplateType) => void;
  onManualChange: (draft: RawRow) => void;
  onManualSave: () => void | Promise<void>;
  onAnalyze: () => void;
  onDownloadTemplate: (type: UploadTemplateType) => void;
  onDownloadCustomerExport: () => void;
  onDownloadSalesExport: () => void;
}) {
  const [entryMode, setEntryMode] = useState<EntryMode>("excel");
  const [reviewTab, setReviewTab] = useState<"mapping" | "quality" | "save">("mapping");
  const sidebarSection: DataRegistrationSection = reviewTab === "save" ? "history" : uploadType === "customer-master" ? "customer" : "sales";

  // 지도 홈 검색에서 "거래처로 등록"을 누르면 이 화면으로 prefill_* 쿼리 파라미터와 함께
  // 넘어옵니다. 엑셀 업로드 화면 대신 바로 수기 등록 폼을 열고 카카오 검색 결과로 필드를
  // 채워서, 여기 이미 있는 사업자등록증/신분증/적재위치 첨부 업로드로 곧장 이어지게 합니다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const prefillName = params.get("prefill_name");
    if (!prefillName) return;

    const prefillAddress = params.get("prefill_address") || "";
    setEntryMode("manual");
    onUploadType("customer-master");
    onManualChange({
      ...manualDraft,
      customerName: prefillName,
      address: prefillAddress || manualDraft.address,
      region: prefillAddress ? extractRegion(prefillAddress) : manualDraft.region,
      phone: params.get("prefill_phone") || manualDraft.phone,
      industry: params.get("prefill_industry") || manualDraft.industry,
      kakaoPlaceUrl: params.get("prefill_kakao_place_url") || manualDraft.kakaoPlaceUrl
    });
    // 최초 진입 시 한 번만 URL을 읽어 채우면 되므로 의도적으로 빈 deps를 씁니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function scrollToPanel(id: string) {
    if (typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  function selectDataRegistrationSection(section: DataRegistrationSection) {
    if (section === "history") {
      setReviewTab("save");
      scrollToPanel("save-panel");
      return;
    }
    onUploadType(section === "customer" ? "customer-master" : "sales-analysis");
    if (reviewTab === "save") setReviewTab("mapping");
    scrollToPanel("entry-panel");
  }
  const [businessNameResults, setBusinessNameResults] = useState<BusinessSearchResult[]>([]);
  const [businessNameSearchMessage, setBusinessNameSearchMessage] = useState("");
  const [isSearchingBusinessName, setIsSearchingBusinessName] = useState(false);
  const [showBusinessNameResults, setShowBusinessNameResults] = useState(false);
  // 카카오 주소·매장 검색으로 채운 필드는 사업자등록증 원본 값이 아니라 카카오 지도 기준 정보입니다.
  // 사업자등록증 값과 섞여 보이지 않도록 어떤 필드가 카카오에서 왔는지 별도로 추적합니다.
  const [kakaoSourcedFields, setKakaoSourcedFields] = useState<Set<string>>(new Set());
  const [documentOcrFilename, setDocumentOcrFilename] = useState("");
  const [documentOcrMeta, setDocumentOcrMeta] = useState<OcrMeta | null>(null);
  const [documentOcrStatus, setDocumentOcrStatus] = useState("");
  const [documentOcrPreviewUrl, setDocumentOcrPreviewUrl] = useState("");
  useEffect(() => {
    return () => {
      if (documentOcrPreviewUrl) URL.revokeObjectURL(documentOcrPreviewUrl);
    };
  }, [documentOcrPreviewUrl]);
  const [savedPreset, setSavedPreset] = useState<FieldMap | null>(null);
  const [presetMessage, setPresetMessage] = useState("");
  // 중복 허용(종사업자번호 등) 목록에 등록된 사업자번호는 업로드 미리보기의 "중복 후보" 경고에서 제외합니다.
  const [exemptBusinessNumbers, setExemptBusinessNumbers] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    fetch(businessNumberExceptionsEndpoint(), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !Array.isArray(payload?.exceptions)) return;
        setExemptBusinessNumbers(new Set(payload.exceptions.map((item: { businessRegistrationNumber: string }) => item.businessRegistrationNumber)));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const requiredFields = template.fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !fieldMap[field.key]);
  const complete = missingRequiredFields.length === 0;
  const isMaster = uploadType === "customer-master";
  const externalPlaceLinkKeys = ["naverPlaceUrl", "kakaoPlaceUrl", "googleMapUrl"];
  const manualCoreFields = template.fields.filter((field) => !externalPlaceLinkKeys.includes(field.key));
  const manualPlaceLinkFields = template.fields.filter((field) => externalPlaceLinkKeys.includes(field.key));
  const manualBusinessNumber = String(manualDraft.businessRegistrationNumber ?? "");
  // 지도 검색으로 찾은 미등록 매장을 현장에서 바로 등록할 때는 사업자등록증이 아직 없을 수 있습니다.
  // 그래서 빠른 등록(entryMode === "manual")에서는 사업자번호·대표자명을 필수에서 제외하고,
  // 저장 후 서류(사업자등록증) 업로드로 보완하도록 합니다. OCR 서류 검토 모드(entryMode === "document")는
  // 서류를 보며 입력하는 화면이므로 기존 필수값 그대로 유지합니다.
  const relaxedManualFieldKeys = entryMode === "manual" ? new Set(["businessRegistrationNumber", "representativeName"]) : new Set<string>();
  const manualBusinessNumberValid = !isMaster
    ? true
    : relaxedManualFieldKeys.has("businessRegistrationNumber")
      ? !manualBusinessNumber || isValidBusinessRegistrationNumber(manualBusinessNumber)
      : isValidBusinessRegistrationNumber(manualBusinessNumber);
  const manualMissingRequiredFields = template.fields.filter(
    (field) => field.required && !relaxedManualFieldKeys.has(field.key) && !String(manualDraft[field.key] ?? "").trim()
  );
  const manualAddressSelected = !isMaster || Boolean(String(manualDraft.address ?? "").trim());
  const manualComplete =
    manualMissingRequiredFields.length === 0 && manualBusinessNumberValid;
  const canAnalyze = rawRows.length > 0 && complete;
  const mappedRequiredCount = requiredFields.length - missingRequiredFields.length;
  const mappingProgress = requiredFields.length ? Math.round((mappedRequiredCount / requiredFields.length) * 100) : 100;
  const dataQuality = useMemo(
    () => summarizeDataQuality(rawRows, requiredFields, fieldMap, exemptBusinessNumbers),
    [exemptBusinessNumbers, fieldMap, rawRows, requiredFields]
  );
  const uploadHint = isMaster
    ? "사업자 정보, 배송주소, 대표자, 연락처를 거래처 기준정보로 저장합니다."
    : "거래처 key와 매출 행을 누적해 일/월/분기/반기/연 분석과 이탈 징후를 갱신합니다.";
  const hasDataRows = rawRows.length > 0;
  const hasBlockingQualityIssues = dataQuality.issueRows.length > 0 || dataQuality.invalidBusinessNumbers.length > 0;
  const latestUpload = uploadHistory[0];
  const saveReadinessItems = [
    {
      detail: hasDataRows ? `${rawRows.length.toLocaleString()}행 등록 대기` : "엑셀 업로드 또는 수기 입력이 필요합니다.",
      label: "등록 데이터",
      ok: hasDataRows
    },
    {
      detail: complete ? "필수 표준 필드 연결 완료" : `${missingRequiredFields.map((field) => field.label).join(", ")} 연결 필요`,
      label: "필수 매핑",
      ok: complete
    },
    {
      detail: hasBlockingQualityIssues ? `보완 행 ${dataQuality.issueRows.length.toLocaleString()}개 · 사업자번호 오류 ${dataQuality.invalidBusinessNumbers.length.toLocaleString()}개` : "저장 전 차단 오류 없음",
      label: "품질 검증",
      ok: !hasBlockingQualityIssues
    },
    {
      detail: pipelineMeta.persisted ? "운영 화면 확인 가능" : "저장 버튼 실행 후 확인됩니다.",
      label: "저장 확인",
      ok: pipelineMeta.persisted
    }
  ];
  const readyCheckCount = saveReadinessItems.filter((item) => item.ok).length;
  const readinessPercent = Math.round((readyCheckCount / saveReadinessItems.length) * 100);
  const flowSteps = [
    {
      description: isMaster ? "거래처 정보는 히스토리와 배송 코스의 기준값입니다." : "매출 원장은 등급, 이탈, 리포트의 기준값입니다.",
      done: Boolean(uploadType),
      label: "등록 유형",
      value: template.label
    },
    {
      description: entryMode === "excel" ? "대량 데이터는 ERP 헤더를 읽고 필수 컬럼을 매핑합니다." : entryMode === "document" ? "사업자등록증 OCR은 수기 입력을 보조하는 선택 방법입니다." : "신규 매장은 주소/사업자번호 검증 후 1건씩 저장합니다.",
      done: entryMode === "manual" || entryMode === "document" ? manualComplete : hasDataRows,
      label: "등록 방식",
      value: entryMode === "excel" ? "대량 등록" : entryMode === "document" ? "OCR 보조 입력" : "수기 등록"
    },
    {
      description: hasBlockingQualityIssues ? "필수값과 사업자번호 오류를 먼저 보완하세요." : "필수 컬럼과 행 품질을 저장 전에 확인합니다.",
      done: hasDataRows && complete && !hasBlockingQualityIssues,
      label: "검증",
      value: hasDataRows ? `${mappedRequiredCount}/${requiredFields.length} 필수 매핑` : "대기 중"
    },
    {
      description: pipelineMeta.persisted ? "저장 후 리포트와 운영 화면에 반영됐습니다." : "업데이트 후 리포트 갱신을 눌러 저장 결과를 확인합니다.",
      done: pipelineMeta.persisted,
      label: "저장",
      value: pipelineMeta.persisted ? "저장 완료" : "저장 확인 전"
    }
  ];
  const implementationProgressItems = [
    {
      description: "거래처 등록과 매출 원장 등록 흐름을 구분했습니다.",
      done: true,
      label: "등록 흐름"
    },
    {
      description: "엑셀 전체 미리보기와 ERP 헤더 매핑 전용화면을 제공합니다.",
      done: true,
      label: "엑셀 매핑"
    },
    {
      description: "수기 등록, 주소 검색, 사업자번호 검증, 외부 지도 링크를 연결했습니다.",
      done: true,
      label: "수기 등록"
    },
    {
      description: "OCR은 필수가 아닌 보조 입력으로 분리하고 첨부자료 기준을 정리했습니다.",
      done: true,
      label: "OCR·첨부"
    },
    {
      description: "대시보드에서 거래처, 매출, 지도·코스 기준값의 일치 여부를 자동 점검합니다.",
      done: true,
      label: "운영 검증 자동화"
    },
    {
      description: "저장 직후 서버 응답과 화면 반영 결과를 분리해서 확인할 수 있게 정리했습니다.",
      done: true,
      label: "저장 결과 대조"
    },
    {
      description: "대시보드, 코스, 거래처 히스토리의 정보 밀도와 탭 구분을 정리했습니다.",
      done: true,
      label: "주요 화면 밀도 정리"
    },
    {
      description: "모바일 직원 사용 흐름과 현장 완료 기록을 연결했습니다.",
      done: true,
      label: "모바일 현장 흐름"
    },
    {
      description: "모바일 현장 기록이 거래처 원장, 메모·방문, 첨부자료로 연결되는 추적 화면을 추가했습니다.",
      done: true,
      label: "현장 기록 추적"
    },
    {
      description: "지도 홈의 지도, 목록, 오늘 코스 영역이 잘리지 않도록 스크롤 기준을 정리했습니다.",
      done: true,
      label: "운영 QA 정리"
    },
    {
      description: "수기 등록, 저장 상태, 검수 목록, 빈 상태 안내 문구를 운영자가 이해하기 쉽게 정리했습니다.",
      done: true,
      label: "운영 문구 정리"
    },
    {
      description: "저장 상태, 업로드 이력, 지도 홈, 원장 확인 경로를 등록 화면에 고정했습니다.",
      done: true,
      label: "배포 전 체크리스트"
    },
    {
      description: "등록 유형, 방식, 반영 화면, 저장 상태를 하나의 운영 기준 요약 카드로 압축했습니다.",
      done: true,
      label: "운영 카드 압축"
    },
    {
      description: "관리자, 고객사 대시보드, 데이터 등록, 히스토리, 코스, 모바일 현장 경로를 점검 패널로 고정했습니다.",
      done: true,
      label: "핵심 플로우 점검"
    },
    {
      description: "실배포 전 환경변수 점검 스크립트와 관리자 시스템 안내를 같은 기준으로 맞췄습니다.",
      done: true,
      label: "실배포 환경 점검"
    },
    {
      description: "최종 검수 기록 문서와 배포 가이드의 환경변수/운영 테스트 기준을 정리했습니다.",
      done: true,
      label: "최종 검수 기록"
    },
    {
      description: "Vercel Logs, Supabase Logs, 화면 Digest, companyId 기준의 오류 추적 순서를 정리했습니다.",
      done: true,
      label: "운영 로그 추적"
    },
    {
      description: "운영 전환 릴리즈 범위, 배포 전 확인 항목, 알려진 제약, 다음 릴리즈 후보를 정리했습니다.",
      done: true,
      label: "릴리즈 노트 정리"
    },
    {
      description: "배포 직후 확인할 Production URL 8개 경로와 통과 기준을 최종 QA 문서에 고정했습니다.",
      done: true,
      label: "Production 최종 확인"
    },
    {
      description: "등록 진행률, 막힌 단계, 다음 확인 위치를 같은 상태판에서 확인하도록 정리했습니다.",
      done: true,
      label: "등록 상태 가시화"
    }
  ];
  const reviewTabs = [
    {
      actionHint: !hasDataRows ? "먼저 등록 데이터 준비" : complete ? "다음: 오류 확인" : "필수 헤더 연결",
      description: "ERP 헤더를 MAJU 필드에 연결",
      key: "mapping" as const,
      label: "헤더 매칭",
      statusLabel: !hasDataRows ? "대기" : complete ? "연결 완료" : "필수 연결 필요",
      step: "1",
      tone: !hasDataRows ? "idle" as const : complete ? "ready" as const : "warning" as const,
      value: rawRows.length ? `${mappedRequiredCount}/${requiredFields.length}` : "대기"
    },
    {
      actionHint: !hasDataRows ? "등록 데이터 준비" : !complete ? "헤더 매칭 먼저" : hasBlockingQualityIssues ? "문제 행 보완" : "다음: 저장",
      description: "누락값, 사업자번호, 중복 확인",
      key: "quality" as const,
      label: "오류 확인",
      statusLabel: !hasDataRows ? "대기" : !complete ? "매핑 먼저" : hasBlockingQualityIssues ? "보완 필요" : "검증 완료",
      step: "2",
      tone: !hasDataRows ? "idle" as const : !complete || hasBlockingQualityIssues ? "warning" as const : "ready" as const,
      value: hasBlockingQualityIssues ? "보완 필요" : hasDataRows ? "정상" : "대기"
    },
    {
      actionHint: pipelineMeta.persisted ? "운영 화면 확인" : canAnalyze ? "저장 실행" : "앞 단계 완료",
      description: "저장 상태와 최근 이력 확인",
      key: "save" as const,
      label: "저장",
      statusLabel: pipelineMeta.persisted ? "반영 완료" : canAnalyze ? "저장 가능" : "대기",
      step: "3",
      tone: pipelineMeta.persisted ? "ready" as const : canAnalyze ? "action" as const : "idle" as const,
      value: pipelineMeta.persisted ? "반영 완료" : canAnalyze ? "실행 가능" : "대기"
    }
  ];
  const activeReviewTab = reviewTabs.find((tab) => tab.key === reviewTab) || reviewTabs[0];
  const adminCompanyId = getAdminCompanyIdFromUrl();
  const pairedTemplateType: UploadTemplateType = uploadType === "customer-master" ? "sales-analysis" : "customer-master";
  const currentExportAction = uploadType === "customer-master" ? onDownloadCustomerExport : onDownloadSalesExport;
  const currentExportLabel = uploadType === "customer-master" ? "현재 거래처 데이터" : "현재 매출 원장";
  const pairedTemplateLabel = uploadType === "customer-master" ? "매출 양식도 받기" : "거래처 양식도 받기";
  const currentLedgerPath = uploadType === "customer-master" ? "/crm/timeline" : "/revenue/transactions";
  const currentLedgerHref = adminCompanyId ? `${currentLedgerPath}?companyId=${encodeURIComponent(adminCompanyId)}` : currentLedgerPath;
  const currentLedgerLabel = uploadType === "customer-master" ? "거래처 히스토리 보기" : "매출 원장 보기";
  const dashboardHref = adminCompanyId ? `/dashboard?companyId=${encodeURIComponent(adminCompanyId)}` : "/dashboard";
  const routeHref = adminCompanyId ? `/dashboard?companyId=${encodeURIComponent(adminCompanyId)}` : "/dashboard";
  const mobileTodayHref = adminCompanyId ? `/mobile/today?companyId=${encodeURIComponent(adminCompanyId)}` : "/mobile/today";

  useEffect(() => {
    if (!hasDataRows) {
      setReviewTab("mapping");
      return;
    }

    if (pipelineMeta.persisted) {
      setReviewTab("save");
      return;
    }

    if (complete && hasBlockingQualityIssues) {
      setReviewTab("quality");
    }
  }, [complete, hasBlockingQualityIssues, hasDataRows, pipelineMeta.persisted, uploadType]);

  const businessNameQuery = String(manualDraft.customerName || "").trim();

  useEffect(() => {
    if (!isMaster || businessNameQuery.length < 2) {
      setBusinessNameResults([]);
      setBusinessNameSearchMessage("");
      setIsSearchingBusinessName(false);
      return;
    }

    let cancelled = false;
    setIsSearchingBusinessName(true);
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/business-search?query=${encodeURIComponent(businessNameQuery)}`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      const payload = response?.ok ? await response.json().catch(() => null) : null;
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setBusinessNameResults(results);
      setBusinessNameSearchMessage(results.length ? "" : payload?.message || "일치하는 매장을 찾지 못했습니다.");
      setIsSearchingBusinessName(false);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [businessNameQuery, isMaster]);

  function selectBusinessName(result: BusinessSearchResult) {
    const resolvedAddress = result.roadAddress || result.address;
    onManualChange({
      ...manualDraft,
      customerName: result.name,
      address: resolvedAddress || manualDraft.address,
      region: resolvedAddress ? extractRegion(resolvedAddress) : manualDraft.region,
      phone: result.phone || manualDraft.phone,
      industry: result.industry || manualDraft.industry,
      kakaoPlaceUrl: result.kakaoPlaceUrl || manualDraft.kakaoPlaceUrl
    });
    setBusinessNameResults([]);
    setShowBusinessNameResults(false);
    setBusinessNameSearchMessage("선택한 매장 정보를 반영했습니다.");
    // 사업자등록증에 없는 카카오 지도 기준 값이므로 어떤 필드가 채워졌는지 표시해 둡니다.
    setKakaoSourcedFields((previous) => {
      const next = new Set(previous);
      if (resolvedAddress) {
        next.add("address");
        next.add("region");
      }
      if (result.phone) next.add("phone");
      if (result.industry) next.add("industry");
      return next;
    });
  }

  async function applyDocumentOcr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    onUploadType("customer-master");
    setDocumentOcrFilename(file.name);
    setDocumentOcrStatus("OCR 추출 중입니다. 잠시만 기다려주세요.");
    setDocumentOcrPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(file);
    });

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/ocr/business-license", {
      method: "POST",
      body: formData
    }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    const extracted = payload?.extracted || {};

    if (!payload) {
      setDocumentOcrStatus("OCR 요청에 실패했습니다. 파일을 다시 선택하거나 수기로 입력하세요.");
      setDocumentOcrMeta(null);
      return;
    }

    setDocumentOcrMeta({
      confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
      mode: String(payload.mode || "unknown"),
      provider: String(payload.provider || "sample"),
      warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : []
    });
    setDocumentOcrStatus(payload.message || "OCR 추출값을 확인하세요.");
    onManualChange({
      ...manualDraft,
      ...extracted
    });
  }

  useEffect(() => {
    let active = true;
    const preset = loadMappingPreset(uploadType);
    setSavedPreset(preset);
    setPresetMessage(preset ? `${template.label} 매핑 프리셋이 저장되어 있습니다.` : "");

    fetch(mappingPresetEndpoint(uploadType), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload?.preset?.mapping) return;
        setSavedPreset(payload.preset.mapping);
        saveMappingPreset(uploadType, payload.preset.mapping);
        setPresetMessage(payload.persisted ? `${template.label} 서버 매핑 프리셋이 저장되어 있습니다.` : `${template.label} 브라우저 매핑 프리셋이 저장되어 있습니다.`);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [template.label, uploadType]);

  async function saveCurrentPreset() {
    saveMappingPreset(uploadType, fieldMap);
    setSavedPreset(fieldMap);
    setPresetMessage(`${template.label} 매핑을 저장 중입니다.`);

    const response = await fetch(mappingPresetEndpoint(uploadType), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: getAdminCompanyIdFromUrl(),
        mapping: fieldMap,
        uploadType
      })
    }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;

    setPresetMessage(
      payload?.persisted
        ? `${template.label} 매핑을 서버에 저장했습니다. 같은 고객사는 다른 PC에서도 불러올 수 있습니다.`
        : `${template.label} 매핑을 이 브라우저에 저장했습니다. 운영 저장은 환경 확인이 필요합니다.`
    );
  }

  function applySavedPreset() {
    if (!savedPreset) return;
    const filteredPreset = Object.entries(savedPreset).reduce<FieldMap>((map, [key, value]) => {
      if (!value || headers.includes(value)) map[key] = value;
      return map;
    }, {});
    onMap({ ...fieldMap, ...filteredPreset });
    setPresetMessage("저장된 매핑을 현재 업로드 파일에 적용했습니다.");
  }

  async function removeSavedPreset() {
    deleteMappingPreset(uploadType);
    setSavedPreset(null);
    setPresetMessage("저장된 매핑 프리셋을 삭제 중입니다.");

    const response = await fetch(mappingPresetEndpoint(uploadType), {
      method: "DELETE"
    }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;

    setPresetMessage(payload?.persisted ? "서버 매핑 프리셋을 삭제했습니다." : "이 브라우저의 매핑 프리셋을 삭제했습니다.");
  }

  function downloadIssueRows() {
    const issueRows = buildIssueRows(rawRows, dataQuality, fieldMap);
    if (!issueRows.length) return;

    downloadWorkbook(`maju_보완필요행_${uploadTemplates[uploadType].label}_${dateStamp()}.xlsx`, [
      { name: "보완 필요 행", rows: issueRows },
      {
        name: "필수 컬럼",
        rows: requiredFields.map((field) => ({
          필수컬럼: field.label,
          시스템키: field.key,
          현재연결: fieldMap[field.key] || "미연결"
        }))
      }
    ]);
  }

  const showOperationalReview = sidebarSection === "history" || pipelineMeta.persisted;

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]">
      <DataRegistrationSidePanel
        activeSection={sidebarSection}
        customerRows={uploadType === "customer-master" ? rawRows.length : 0}
        onSelect={selectDataRegistrationSection}
        persisted={pipelineMeta.persisted}
        salesRows={uploadType === "sales-analysis" ? rawRows.length : 0}
      />
      <section className="min-w-0 space-y-3">
        <div className="space-y-3">
          <DataRegistrationFlowBar
            activeSection={sidebarSection}
            canAnalyze={canAnalyze}
            customerRows={uploadType === "customer-master" ? rawRows.length : 0}
            onSelect={selectDataRegistrationSection}
            persisted={pipelineMeta.persisted}
            salesRows={uploadType === "sales-analysis" ? rawRows.length : 0}
          />
          <DataRegistrationQuickPanel
            activeType={uploadType}
            canAnalyze={canAnalyze}
            entryMode={entryMode}
            filename={uploadedFilename}
            isAnalyzing={isAnalyzing}
            onAnalyze={onAnalyze}
            onSelectMode={(mode) => {
              if (mode === "document") onUploadType("customer-master");
              setEntryMode(mode);
            }}
            onSelectType={onUploadType}
            persisted={pipelineMeta.persisted}
            registrationStatus={registrationStatus}
            rows={rawRows.length}
            typeLabel={template.label}
          />
          <details className="maju-section-card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span>
              <span className="block text-sm font-black text-slate-950">검수·저장 상태</span>
              <span className="mt-0.5 block text-xs font-bold text-slate-500">저장 가능 여부, 누락값, 확인 경로를 봅니다.</span>
              </span>
              <Badge className={canAnalyze ? "bg-teal-700 text-white" : pipelineMeta.persisted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                {pipelineMeta.persisted ? "저장 완료" : canAnalyze ? "저장 가능" : "확인 필요"}
              </Badge>
            </summary>
            <div className="border-t border-slate-200 bg-slate-50/60 p-3">
              <RegistrationLiveStatusBoard
                canAnalyze={canAnalyze}
                dashboardHref={dashboardHref}
                entryMode={entryMode}
                filename={uploadedFilename}
                latestUpload={latestUpload}
                ledgerHref={currentLedgerHref}
                ledgerLabel={currentLedgerLabel}
                onOpenReviewTab={setReviewTab}
                persisted={pipelineMeta.persisted}
                readinessItems={saveReadinessItems}
                readinessPercent={readinessPercent}
                registrationStatus={registrationStatus}
                routeHref={routeHref}
                rows={rawRows.length}
                typeLabel={template.label}
              />
            </div>
          </details>
          <details className="maju-section-card overflow-hidden" open={showOperationalReview}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-sm font-black text-slate-950">반영 화면 확인</span>
                <span className="mt-0.5 block text-xs font-bold text-slate-500">원장, 대시보드, 지도에 같은 데이터가 보이는지 확인합니다.</span>
              </span>
              <Badge className={readinessPercent >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                준비율 {readinessPercent}%
              </Badge>
            </summary>
            <div className="grid gap-3 border-t border-slate-200 bg-slate-50/60 p-3 xl:grid-cols-2">
              <DeploymentReadinessChecklist
                canAnalyze={canAnalyze}
                dashboardHref={dashboardHref}
                hasRecentUpload={Boolean(latestUpload)}
                hasRows={rawRows.length > 0}
                ledgerHref={currentLedgerHref}
                persisted={pipelineMeta.persisted}
                routeHref={routeHref}
              />
              <DataRegistrationFlowCard steps={flowSteps} />
            </div>
          </details>

        <div className="maju-section-card scroll-mt-4 border-l-4 border-l-teal-700 p-4" id="entry-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="mb-3 bg-teal-700 text-white">입력</Badge>
              <h2 className="text-xl font-black text-slate-950">{template.label}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">등록 방식에 맞는 입력만 남겼습니다. 올리고, 확인하고, 저장하면 됩니다.</p>
            </div>
            <Badge className="w-fit bg-slate-100 px-3 py-1.5 text-slate-700">{entryMode === "excel" ? "엑셀 대량" : entryMode === "manual" ? "수기 1건" : "OCR 보조"}</Badge>
          </div>
          <RegistrationEntrySummary
            activeType={uploadType}
            canAnalyze={canAnalyze}
            entryMode={entryMode}
            persisted={pipelineMeta.persisted}
            rowsWaiting={rawRows.length}
          />

          {entryMode === "excel" ? (
            <>
              <div className="mt-4">
                <label className="maju-panel flex min-h-36 cursor-pointer items-center gap-4 border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-left transition hover:border-slate-400 hover:bg-white">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200">
                    <Upload className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-black text-slate-950">엑셀 선택</span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">ERP 파일을 올리면 전체 행 미리보기와 헤더 매칭으로 이동합니다.</span>
                  </span>
                  <span className="hidden rounded-md bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200 sm:inline-flex">.xlsx · .csv</span>
                  <input className="sr-only" type="file" accept=".xlsx,.csv" onChange={onFile} />
                </label>
              </div>
              <BulkEntryProgress
                complete={complete}
                hasBlockingQualityIssues={hasBlockingQualityIssues}
                mappedRequiredCount={mappedRequiredCount}
                requiredCount={requiredFields.length}
                rows={rawRows.length}
              />
              <BulkNextActionPanel
                canAnalyze={canAnalyze}
                hasBlockingQualityIssues={hasBlockingQualityIssues}
                missingRequiredFields={missingRequiredFields}
                rows={rawRows.length}
                onOpenTab={setReviewTab}
              />
            </>
          ) : entryMode === "document" ? (
            <DocumentOcrRegistrationPanel
              filename={documentOcrFilename}
              isManualSaving={isManualSaving}
              lastManualCustomer={lastManualCustomer}
              manualComplete={manualComplete}
              manualDraft={manualDraft}
              ocrMeta={documentOcrMeta}
              ocrStatus={documentOcrStatus}
              previewUrl={documentOcrPreviewUrl}
              onDocumentFile={applyDocumentOcr}
              onManualChange={onManualChange}
              onManualSave={onManualSave}
            />
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="maju-panel bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-950">수기 등록</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">거래처명과 주소를 먼저 저장하고, 서류와 사업자번호는 이후 보완할 수 있습니다.</p>
                  </div>
                  <Button className="h-10 shrink-0 bg-teal-700 px-4 font-black text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)] hover:bg-teal-800" onClick={onManualSave} disabled={!manualComplete || isManualSaving}>
                    <Save size={18} />
                    {isManualSaving ? "저장 중" : "매장 저장"}
                  </Button>
                </div>

                {manualSaveMessage ? (
                  <ManualSaveResultCard
                    href={lastManualCustomerHref}
                    message={manualSaveMessage}
                    persisted={Boolean(lastManualCustomerHref)}
                  />
                ) : null}

                {duplicateNotice ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-black text-amber-900">
                      &quot;{duplicateNotice.name}&quot;과(와) 이름이 같은 거래처가 이미 있습니다.
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {duplicateNotice.matches.map((match) => (
                        <li className="text-[11px] font-bold text-amber-800" key={match.customerName + match.address}>
                          · {match.customerName}{match.address ? ` (${match.address})` : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <Button className="h-8 bg-white px-3 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50" onClick={onCancelDuplicate}>
                        취소
                      </Button>
                      <Button className="h-8 bg-amber-700 px-3 text-xs font-black text-white hover:bg-amber-800" onClick={onConfirmDuplicate} disabled={isManualSaving}>
                        {isManualSaving ? "등록 중" : "그래도 등록"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {isMaster && lastManualCustomer ? (
                  <div className="mt-4">
                    <CustomerAttachmentUploadPanel customerId={lastManualCustomer.id} customerName={lastManualCustomer.name} />
                  </div>
                ) : null}

                {isMaster ? (
                  <ManualEntryProgress
                    addressSelected={manualAddressSelected}
                    businessNumber={manualBusinessNumber}
                    businessNumberValid={manualBusinessNumberValid}
                    missingFields={manualMissingRequiredFields}
                    ready={manualComplete}
                  />
                ) : null}

                <div className="mt-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {manualCoreFields.map((field) => {
                    const isInvalidBusinessNumber = field.key === "businessRegistrationNumber" && isMaster && Boolean(manualBusinessNumber) && !manualBusinessNumberValid;
                    const isAddressField = field.key === "address" && isMaster;
                    const isBusinessNameField = field.key === "customerName" && isMaster;
                    const isKakaoSourced = isMaster && kakaoSourcedFields.has(field.key);
                    return (
                      <label key={field.key} className={`relative space-y-1.5 rounded-md border bg-white p-2.5 shadow-sm ${isInvalidBusinessNumber ? "border-rose-200" : isAddressField && manualAddressSelected ? "border-emerald-200" : "border-slate-200"}`}>
                        <span className="text-xs font-black text-slate-500">
                          {field.label}
                          {field.required && !relaxedManualFieldKeys.has(field.key) ? <span className="ml-1 text-destructive">*</span> : null}
                          {relaxedManualFieldKeys.has(field.key) ? <span className="ml-1 font-bold text-slate-400">(나중에 서류로 보완 가능)</span> : null}
                        </span>
                        <input
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                          inputMode={manualInputMode(field.key)}
                          type={manualInputType(field.key)}
                          value={String(manualDraft[field.key] ?? "")}
                          onChange={(event) => {
                            const rawValue = event.target.value;
                            const nextValue =
                              field.key === "businessRegistrationNumber"
                                ? formatBusinessNumberInput(rawValue)
                                : field.key === "phone"
                                  ? formatPhoneNumberInput(rawValue)
                                  : rawValue;
                            onManualChange({ ...manualDraft, [field.key]: nextValue });
                            if (isBusinessNameField) setShowBusinessNameResults(true);
                            // 사람이 직접 값을 고쳤으면 더 이상 카카오 원본 그대로가 아니므로 출처 표시를 지웁니다.
                            if (kakaoSourcedFields.has(field.key)) {
                              setKakaoSourcedFields((previous) => {
                                const next = new Set(previous);
                                next.delete(field.key);
                                return next;
                              });
                            }
                          }}
                          onFocus={isBusinessNameField ? () => setShowBusinessNameResults(true) : undefined}
                          onBlur={isBusinessNameField ? () => setTimeout(() => setShowBusinessNameResults(false), 150) : undefined}
                          placeholder={field.description || `${field.label} 입력`}
                          autoComplete="off"
                        />
                        {field.key === "businessRegistrationNumber" && isMaster ? (
                          <span className={`block text-xs font-black ${manualBusinessNumber ? (manualBusinessNumberValid ? "text-emerald-700" : "text-rose-600") : "text-slate-400"}`}>
                            {manualBusinessNumber ? (manualBusinessNumberValid ? `${formatBusinessRegistrationNumber(manualBusinessNumber)} 검증 완료` : "유효하지 않은 번호입니다. 10자리와 체크값을 확인하세요.") : "사업자등록번호 10자리를 입력하세요."}
                          </span>
                        ) : null}
                        {isAddressField ? <span className="block text-xs font-bold text-blue-700">위 거래처명 검색으로 선택하면 자동 반영됩니다. 매장이 검색되지 않으면 직접 입력하세요.</span> : null}
                        {isBusinessNameField ? <span className="block text-xs font-bold text-blue-700">실제 매장을 검색해 선택하면 카카오 지도 기준 주소·전화·업종이 자동 반영됩니다. 사업자등록증 원본과는 다를 수 있어요.</span> : null}
                        {isKakaoSourced ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                            <Info className="h-3 w-3 shrink-0" />
                            카카오 지도 정보 · 사업자등록증 값 아님, 원본과 대조하세요
                          </span>
                        ) : null}
                        {isBusinessNameField && showBusinessNameResults && businessNameQuery.length >= 2 ? (
                          <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {isSearchingBusinessName ? (
                              <p className="px-3 py-2 text-xs font-bold text-slate-400">검색 중...</p>
                            ) : businessNameResults.length ? (
                              businessNameResults.map((result) => (
                                <button
                                  className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50"
                                  key={`${result.name}-${result.address}`}
                                  onClick={() => selectBusinessName(result)}
                                  onMouseDown={(event) => event.preventDefault()}
                                  type="button"
                                >
                                  <span className="block text-sm font-black text-slate-950">{result.name}</span>
                                  <span className="mt-0.5 block text-xs font-bold text-slate-500">{result.roadAddress || result.address || "주소 정보 없음"}</span>
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-xs font-bold text-slate-400">{businessNameSearchMessage || "일치하는 매장을 찾지 못했습니다."}</p>
                            )}
                          </div>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {isMaster ? (
                  <PlaceLinkCapturePanel
                    fields={manualPlaceLinkFields}
                    manualDraft={manualDraft}
                    onManualChange={onManualChange}
                  />
                ) : null}
              </div>

              <ManualValidationPanel
                addressSelected={manualAddressSelected}
                businessNumber={manualBusinessNumber}
                businessNumberValid={manualBusinessNumberValid}
                isManualSaving={isManualSaving}
                isMaster={isMaster}
                lastManualCustomerHref={lastManualCustomerHref}
                manualSaveMessage={manualSaveMessage}
                missingFields={manualMissingRequiredFields}
                onManualSave={onManualSave}
                ready={manualComplete}
              />
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-700" />
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800">자료 도구</p>
                <p className="truncate text-[11px] font-bold text-slate-400">{template.label} 기준</p>
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-4 xl:min-w-[620px]">
              <Button className="h-8 justify-center rounded-md bg-teal-700 px-2.5 text-xs font-black text-white hover:bg-teal-800" onClick={() => onDownloadTemplate(uploadType)} type="button">
                <Download className="h-4 w-4" />
                양식 받기
              </Button>
              <Button className="h-8 justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={currentExportAction} type="button">
                <FileSpreadsheet className="h-4 w-4" />
                {currentExportLabel}
              </Button>
              <Button className="h-8 justify-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => onDownloadTemplate(pairedTemplateType)} type="button">
                <Download className="h-4 w-4" />
                {pairedTemplateLabel}
              </Button>
              <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 hover:bg-slate-50" href={currentLedgerHref}>
                <Banknote className="h-4 w-4" />
                원장 열기
              </Link>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="maju-section-card border-l-4 border-l-violet-600">
          <div className="maju-card-header flex flex-col gap-3 bg-violet-50/40 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-50 text-violet-700">3. 검수</Badge>
                <h2 className="text-base font-black text-slate-950">헤더 · 오류 · 저장</h2>
              </div>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">
                {rawRows.length ? `${rawRows.length}개 행 · 헤더 확인 후 저장` : "등록 후 저장 상태 확인"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{rawRows.length.toLocaleString()}행</Badge>
              <Badge className={complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{complete ? "필수 매칭 완료" : "매칭 필요"}</Badge>
              <Badge className={canAnalyze ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}>{canAnalyze ? "저장 가능" : "대기"}</Badge>
            </div>
          </div>
          <div className="space-y-3 p-3">
            <details className="rounded-md border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-black text-slate-600">
                등록 상세 상태
                <Badge className="bg-white text-slate-600 ring-1 ring-inset ring-slate-200">{uploadedFilename}</Badge>
              </summary>
              <div className="grid gap-3 border-t border-slate-200 bg-white p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <RegistrationStatusCard status={registrationStatus} />
                <UploadStatusCard
                  complete={complete}
                  filename={uploadedFilename}
                  headers={headers}
                  mappedRequiredCount={mappedRequiredCount}
                  mappingProgress={mappingProgress}
                  requiredCount={requiredFields.length}
                  rows={rawRows}
                />
              </div>
            </details>
            {isAnalyzing ? (
              <PipelineStatusPanel steps={pipelineSteps} meta={pipelineMeta} />
            ) : (
              <>
                <div className="maju-section-card scroll-mt-4 overflow-hidden" id="review-panel">
                  <div className="maju-card-header px-3 py-2.5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-950">등록 처리</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">헤더 연결, 오류 확인, 저장 순서로 처리합니다.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">
                          {rawRows.length.toLocaleString()}행
                        </Badge>
                        <Badge className={canAnalyze ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                          {canAnalyze ? "저장 가능" : "확인 필요"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-1 border-t border-slate-200 bg-slate-50 p-1.5 lg:grid-cols-3">
                    {reviewTabs.map((tab) => {
                      const selected = reviewTab === tab.key;
                      const toneClass =
                        tab.tone === "ready"
                          ? selected
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-emerald-50 text-emerald-700"
                          : tab.tone === "warning"
                            ? selected
                              ? "bg-amber-100 text-amber-800"
                              : "bg-amber-50 text-amber-700"
                            : tab.tone === "action"
                              ? selected
                                ? "bg-blue-100 text-blue-800"
                                : "bg-blue-50 text-blue-700"
                              : selected
                                ? "bg-slate-100 text-slate-700"
                                : "bg-white text-slate-500";
                      return (
                        <button
                          key={tab.key}
                          className={`min-w-0 rounded-md border px-3 py-2 text-left transition ${
                            selected
                              ? "border-teal-700 bg-white text-teal-800 shadow-sm"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
                          }`}
                          onClick={() => setReviewTab(tab.key)}
                          type="button"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-black ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                                {tab.step}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-black">{tab.label}</span>
                                <span className={`mt-0.5 block truncate text-[11px] font-bold ${selected ? "text-slate-600" : "text-slate-400"}`}>{tab.actionHint}</span>
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${toneClass}`}>
                                {tab.statusLabel}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                                {tab.value}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    <span className="rounded-md bg-teal-700 px-2 py-0.5 font-black text-white">{activeReviewTab.label}</span>
                    <span className="truncate">{activeReviewTab.actionHint}</span>
                  </div>
                </div>
                {reviewTab === "mapping" ? (
                  <>
                    <div className="scroll-mt-4" id="mapping-panel">
                      <ExcelHeaderMappingPreview
                        fields={template.fields}
                        fieldMap={fieldMap}
                        headers={headers}
                        onMap={onMap}
                        onRequestQualityReview={() => setReviewTab("quality")}
                        rows={rawRows}
                      />
                    </div>
                    <MappingPresetCard
                      canLoad={Boolean(savedPreset)}
                      canSave={headers.length > 0 && Object.keys(fieldMap).length > 0}
                      message={presetMessage}
                      templateLabel={template.label}
                      onLoad={applySavedPreset}
                      onRemove={removeSavedPreset}
                      onSave={saveCurrentPreset}
                    />
                  </>
                ) : null}
                {reviewTab === "quality" ? (
                  <div className="scroll-mt-4" id="quality-panel">
                    <DataQualityCard summary={dataQuality} onDownloadIssues={downloadIssueRows} onOpenSaveReview={() => setReviewTab("save")} />
                  </div>
                ) : null}
                {reviewTab === "save" ? (
                  <div className="scroll-mt-4 space-y-5" id="save-panel">
                    <SaveResultSummary
                      canAnalyze={canAnalyze}
                      ledgerHref={currentLedgerHref}
                      ledgerLabel={currentLedgerLabel}
                      missingRequiredFields={missingRequiredFields}
                      persisted={pipelineMeta.persisted}
                      registrationStatus={registrationStatus}
                      rows={rawRows.length}
                    />
                    <SaveReadinessPanel
                      canAnalyze={canAnalyze}
                      dashboardHref={dashboardHref}
                      items={saveReadinessItems}
                      ledgerHref={currentLedgerHref}
                      ledgerLabel={currentLedgerLabel}
                      persisted={pipelineMeta.persisted}
                      routeHref={routeHref}
                      typeLabel={template.label}
                    />
                    <RecentUploadHistoryCard uploads={uploadHistory} />
                  </div>
                ) : null}
                {!headers.length ? (
                  <div className="maju-empty-state p-4 text-center">
                    <p className="font-black text-slate-950">아직 등록 데이터가 없습니다.</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">엑셀을 올리거나 매장을 저장하면 헤더, 오류, 저장 상태가 순서대로 표시됩니다.</p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </aside>
      </section>
    </div>
  );
}

function DataRegistrationQuickPanel({
  activeType,
  canAnalyze,
  entryMode,
  filename,
  isAnalyzing,
  onAnalyze,
  onSelectMode,
  onSelectType,
  persisted,
  registrationStatus,
  rows,
  typeLabel
}: {
  activeType: UploadTemplateType;
  canAnalyze: boolean;
  entryMode: EntryMode;
  filename: string;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onSelectMode: (mode: EntryMode) => void;
  onSelectType: (type: UploadTemplateType) => void;
  persisted: boolean;
  registrationStatus: RegistrationStatus;
  rows: number;
  typeLabel: string;
}) {
  const typeOptions = [
    {
      description: "주소·사업자·담당자",
      icon: Building2,
      id: "customer-master" as UploadTemplateType,
      label: "거래처 기본정보",
      value: "기초"
    },
    {
      description: "ERP 원장·품목·금액",
      icon: Banknote,
      id: "sales-analysis" as UploadTemplateType,
      label: "매출 원장",
      value: "매출"
    }
  ];
  const modeOptions = [
    { description: "ERP 파일", icon: Upload, id: "excel" as EntryMode, label: "엑셀", value: "대량" },
    { description: "1곳 등록", icon: Building2, id: "manual" as EntryMode, label: "수기", value: "단건" },
    { description: "서류 보조", icon: FileSpreadsheet, id: "document" as EntryMode, label: "OCR", value: "보조" }
  ];
  const selectedMode = modeOptions.find((option) => option.id === entryMode) || modeOptions[0];
  const statusTone = persisted ? "bg-emerald-50 text-emerald-800 ring-emerald-100" : canAnalyze ? "bg-teal-700 text-white ring-teal-700" : rows ? "bg-amber-50 text-amber-800 ring-amber-100" : "bg-slate-100 text-slate-700 ring-slate-200";
  const nextLabel = persisted ? "반영 완료" : canAnalyze ? "저장 실행" : rows ? "검수 필요" : "등록 시작";
  const nextDescription = persisted
    ? "대시보드, 원장, 지도에서 같은 데이터 기준으로 확인하세요."
    : canAnalyze
      ? "필수 조건이 맞았습니다. 저장하고 리포트를 갱신하세요."
      : rows
        ? "필드 매칭과 데이터 검수를 먼저 확인하세요."
        : "거래처 또는 매출 원장을 선택하고 등록 방식을 고르세요.";

  return (
    <div className="maju-section-card overflow-hidden border-l-4 border-l-teal-700">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-3">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <div className="flex min-w-[150px] items-center gap-2">
              <Badge className="bg-teal-700 text-white ring-1 ring-inset ring-teal-700">등록 설정</Badge>
              <Badge className={`w-fit px-2.5 py-1 text-[11px] font-black ring-1 ${statusTone}`}>{nextLabel}</Badge>
            </div>
            <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-black text-slate-400">등록 데이터</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {typeOptions.map((option) => {
                    const selected = activeType === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        className={`flex h-11 min-w-0 items-center gap-2 rounded-md border px-3 text-left transition ${
                          selected ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        key={option.id}
                        onClick={() => onSelectType(option.id)}
                        type="button"
                      >
                        <Icon className={selected ? "h-4 w-4 shrink-0 text-white" : "h-4 w-4 shrink-0 text-slate-400"} />
                        <span className="min-w-0 flex-1 truncate text-sm font-black">{option.label}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-white text-slate-950" : "bg-slate-100 text-slate-400"}`}>
                          {option.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-black text-slate-400">입력 방식</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {modeOptions.map((option) => {
                    const selected = entryMode === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-center transition ${
                          selected ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        key={option.id}
                        onClick={() => onSelectMode(option.id)}
                        type="button"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
                        <span className="truncate text-sm font-black">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/80 p-3 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-400">현재 작업</p>
              <p className="mt-0.5 truncate text-sm font-black text-slate-950">{typeLabel} · {selectedMode.label}</p>
            </div>
            <Badge className={`shrink-0 px-2 py-1 text-[11px] font-black ring-1 ${statusTone}`}>{nextLabel}</Badge>
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
            {[
              ["대기 행", rows ? `${rows.toLocaleString()}행` : "없음"],
              ["파일", rows ? filename : "선택 전"]
            ].map(([label, value]) => (
              <div className="grid grid-cols-[92px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0" key={label}>
                <span className="bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-400">{label}</span>
                <span className="truncate px-3 py-2 text-xs font-black text-slate-900">{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 line-clamp-2 min-h-10 rounded-md bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600 ring-1 ring-inset ring-slate-200">{nextDescription}</p>
          <Button className="maju-button-primary mt-2 h-10 w-full" disabled={!canAnalyze || isAnalyzing} onClick={onAnalyze}>
            {isAnalyzing ? "저장 중" : canAnalyze ? "저장하고 리포트 갱신" : registrationStatus.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RegistrationLiveStatusBoard({
  canAnalyze,
  dashboardHref,
  entryMode,
  filename,
  latestUpload,
  ledgerHref,
  ledgerLabel,
  onOpenReviewTab,
  persisted,
  readinessItems,
  readinessPercent,
  registrationStatus,
  routeHref,
  rows,
  typeLabel
}: {
  canAnalyze: boolean;
  dashboardHref: string;
  entryMode: EntryMode;
  filename: string;
  latestUpload?: UploadHistoryRow;
  ledgerHref: string;
  ledgerLabel: string;
  onOpenReviewTab: (tab: "mapping" | "quality" | "save") => void;
  persisted: boolean;
  readinessItems: Array<{ detail: string; label: string; ok: boolean }>;
  readinessPercent: number;
  registrationStatus: RegistrationStatus;
  routeHref: string;
  rows: number;
  typeLabel: string;
}) {
  const modeLabel = entryMode === "excel" ? "엑셀 대량 등록" : entryMode === "document" ? "OCR 보조 입력" : "수기 1건 등록";
  const statusClass = {
    error: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    idle: "bg-slate-100 text-slate-700",
    ready: "bg-teal-700 text-white ring-1 ring-teal-700",
    running: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
  }[registrationStatus.status];

  const summary = [
    { label: "등록 유형", value: typeLabel },
    { label: "등록 방식", value: modeLabel },
    { label: "검수 대기", value: `${rows.toLocaleString()}행` },
    { label: "최근 저장", value: latestUpload?.createdAt || "아직 없음" }
  ];
  const verificationLinks = [
    { href: dashboardHref, label: "대시보드", value: "회사 KPI 확인" },
    { href: ledgerHref, label: ledgerLabel.replace(" 보기", ""), value: "원장 반영 확인" },
    { href: routeHref, label: "지도 홈", value: "지도/코스 확인" }
  ];
  const diagnosticLinks = getRegistrationDiagnosticLinks(registrationStatus.status, canAnalyze, persisted, rows);
  const blockingItem = readinessItems.find((item) => !item.ok);
  const primaryAction = diagnosticLinks.find((link) => link.tab) || diagnosticLinks[0];
  const currentStage = persisted ? "저장 완료" : canAnalyze ? "저장 실행" : blockingItem?.label || (rows ? "입력 검토" : "데이터 준비");
  const currentStageDetail = persisted
    ? "대시보드, 원장, 지도 화면에서 같은 기준값을 확인합니다."
    : canAnalyze
      ? "필수 조건이 충족됐습니다. 저장 버튼을 실행하세요."
      : blockingItem?.detail || "엑셀 업로드, 수기 등록, OCR 보조 입력 중 하나로 데이터를 준비하세요.";

  return (
    <div className="maju-section-card overflow-hidden">
      <div className="maju-card-header grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px_300px] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass}>{registrationStatus.actionLabel}</Badge>
            <Badge className={persisted ? "bg-emerald-700 text-white" : canAnalyze ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}>
              {persisted ? "저장 완료" : canAnalyze ? "저장 가능" : "저장 전 확인"}
            </Badge>
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-950">{registrationStatus.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">{registrationStatus.description}</p>
          <p className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-black leading-5 text-slate-700">다음: {registrationStatus.nextAction}</p>
        </div>
        <div className="maju-panel bg-white p-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black text-slate-400">저장 준비율</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{readinessPercent}%</p>
            </div>
            <p className="pb-1 text-xs font-black text-slate-500">{readinessItems.filter((item) => item.ok).length}/{readinessItems.length} 완료</p>
          </div>
          <Progress className="mt-3 h-2" value={readinessPercent} />
        </div>
        <div className={`maju-panel p-3 ${persisted ? "border-emerald-100 bg-emerald-50" : canAnalyze ? "border-slate-200 bg-slate-50" : "border-amber-100 bg-amber-50"}`}>
          <p className={`text-xs font-black ${persisted ? "text-emerald-800" : canAnalyze ? "text-slate-700" : "text-amber-800"}`}>현재 단계</p>
          <p className="mt-1 text-base font-black text-slate-950">{currentStage}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{currentStageDetail}</p>
          {primaryAction?.tab ? (
            <Button
              className="mt-3 h-9 w-full"
              onClick={() => {
                onOpenReviewTab(primaryAction.tab!);
                window.setTimeout(() => document.getElementById(`${primaryAction.tab}-panel`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }}
              type="button"
              variant="outline"
            >
              {primaryAction.label} 바로 확인
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : primaryAction ? (
            <Link
              className="maju-button-secondary mt-3 inline-flex h-9 w-full items-center justify-center gap-2 px-3 text-sm"
              href={primaryAction.href}
            >
              {primaryAction.label} 바로 확인
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="grid border-b border-slate-100 md:grid-cols-4">
        {summary.map((item) => (
          <div className="border-b border-slate-100 px-4 py-3 md:border-b-0 md:border-r last:md:border-r-0" key={item.label}>
            <p className="text-xs font-black text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950" title={item.value}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-4">
        {readinessItems.map((item) => (
          <div className={`maju-filter-box px-3 py-2 ${item.ok ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"}`} key={item.label}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-xs font-black ${item.ok ? "text-emerald-800" : "text-slate-700"}`}>{item.label}</p>
              {item.ok ? <Check className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-slate-400" />}
            </div>
            <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
      {diagnosticLinks.length ? (
        <div className="border-t border-slate-100 bg-slate-50/70 p-3">
          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-black text-slate-500">확인 필요 항목</p>
            <p className="text-xs font-bold text-slate-400">저장이 막히면 아래 순서대로 확인합니다.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {diagnosticLinks.map((link, index) => (
              <RegistrationDiagnosticAction action={link} index={index} key={link.label} onOpenReviewTab={onOpenReviewTab} />
            ))}
          </div>
        </div>
      ) : null}
      {rows ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
          현재 파일: <span className="font-black text-slate-800">{filename}</span>
        </div>
      ) : null}
      <div className="border-t border-slate-100 bg-white p-3">
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-black text-slate-500">저장 후 확인 경로</p>
          <p className="text-xs font-bold text-slate-400">{persisted ? "운영 화면에서 같은 기준값을 확인하세요." : "저장 전에도 화면 구조는 미리 확인할 수 있습니다."}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {verificationLinks.map((link, index) => (
            <Link
              className={`maju-filter-box px-3 py-2 ${
                persisted ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100/70" : "border-slate-200 bg-slate-50 hover:bg-white"
              }`}
              href={link.href}
              key={link.label}
            >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-400">{index + 1}단계</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <span className="mt-1 block text-sm font-black text-slate-950">{link.label}</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{link.value}</span>
              </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

type RegistrationDiagnosticLink = {
  description: string;
  href: string;
  label: string;
  tab?: "mapping" | "quality" | "save";
};

function RegistrationDiagnosticAction({
  action,
  index,
  onOpenReviewTab
}: {
  action: RegistrationDiagnosticLink;
  index: number;
  onOpenReviewTab: (tab: "mapping" | "quality" | "save") => void;
}) {
  const className = "rounded-md border border-amber-100 bg-white px-3 py-2 text-left transition hover:bg-amber-50/60";
  const content = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-amber-700">{index + 1}순위</span>
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
      </span>
      <span className="mt-1 block text-sm font-black text-slate-950">{action.label}</span>
      <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{action.description}</span>
    </>
  );

  if (action.tab) {
    return (
      <button
        className={className}
        onClick={() => {
          onOpenReviewTab(action.tab!);
          window.setTimeout(() => document.getElementById(`${action.tab}-panel`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        }}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <Link className={className} href={action.href}>
      {content}
    </Link>
  );
}

function getRegistrationDiagnosticLinks(status: RegistrationStatus["status"], canAnalyze: boolean, persisted: boolean, rows: number): RegistrationDiagnosticLink[] {
  if (persisted) return [];

  if (status === "error") {
    return [
      { description: "저장소, 파일함, 환경변수 상태를 확인합니다.", href: "/admin/system", label: "시스템 점검" },
      { description: "최근 실패한 업로드와 저장 응답을 확인합니다.", href: "/admin/uploads", label: "업로드 이력" },
      { description: "고객사 로그인 세션을 다시 확인합니다.", href: "/dashboard/login", label: "로그인 확인" }
    ];
  }

  if (status === "warning") {
    return [
      { description: "필수 컬럼 연결 상태를 확인합니다.", href: "#mapping-panel", label: "헤더 매칭", tab: "mapping" },
      { description: "누락값, 사업자번호, 중복 후보를 확인합니다.", href: "#quality-panel", label: "오류 확인", tab: "quality" },
      { description: "저장소와 운영 환경값을 확인합니다.", href: "/admin/system", label: "저장 환경" },
    ];
  }

  if (canAnalyze) {
    return [];
  }

  if (rows > 0) {
    return [
      { description: "필수 필드 연결을 확인합니다.", href: "#mapping-panel", label: "헤더 매칭", tab: "mapping" },
      { description: "누락값, 사업자번호, 중복 후보를 확인합니다.", href: "#quality-panel", label: "오류 확인", tab: "quality" },
      { description: "로그인 또는 저장 문제를 확인합니다.", href: "/admin/system", label: "저장 환경" }
    ];
  }

  return [];
}

function ImplementationProgressCard({
  items
}: {
  items: Array<{ description: string; done: boolean; label: string }>;
}) {
  const doneCount = items.filter((item) => item.done).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const nextItem = items.find((item) => !item.done) || items[items.length - 1];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px] lg:items-center">
        <div>
          <p className="text-xs font-black text-slate-400">현재 개선 진행률</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{progress}%</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{doneCount}/{items.length}개 항목 완료</p>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs font-black text-slate-500">
            <span>데이터 등록 실운영화</span>
            <span>다음: {nextItem.label}</span>
          </div>
          <Progress className="mt-2 h-2" value={progress} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                  item.done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
                key={item.label}
              >
                {item.done ? "완료" : "대기"} · {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs font-black text-blue-800">다음 작업</p>
          <p className="mt-1 text-sm font-black leading-5 text-slate-950">{nextItem.label}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-blue-800">{nextItem.description}</p>
        </div>
      </div>
    </div>
  );
}

function DeploymentReadinessChecklist({
  canAnalyze,
  dashboardHref,
  hasRecentUpload,
  hasRows,
  ledgerHref,
  persisted,
  routeHref
}: {
  canAnalyze: boolean;
  dashboardHref: string;
  hasRecentUpload: boolean;
  hasRows: boolean;
  ledgerHref: string;
  persisted: boolean;
  routeHref: string;
}) {
  const checks = [
    {
      done: persisted,
      helper: persisted ? "저장 응답 확인" : "Vercel env, Supabase schema, 로그인 상태 확인",
      label: "저장 상태"
    },
    {
      done: hasRecentUpload,
      helper: hasRecentUpload ? "최근 업로드 이력 확인" : "거래처 또는 매출 원장 등록 필요",
      label: "업로드 이력"
    },
    {
      done: hasRows && canAnalyze,
      helper: canAnalyze ? "필수 매핑과 품질 검증 통과" : "필수 컬럼 매핑과 보완 행 확인 필요",
      label: "등록 품질"
    },
    {
      done: true,
      helper: "대시보드, 원장, 코스 화면으로 바로 이동 가능",
      label: "운영 화면 연결"
    }
  ];
  const doneCount = checks.filter((check) => check.done).length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:items-center">
        <div>
          <Badge className="bg-teal-700 text-white">저장 후 체크</Badge>
          <h2 className="mt-3 text-lg font-black text-slate-950">등록 후 확인할 화면</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            저장 이력, 거래처 원장, 지도·코스가 같은 고객사 기준으로 이어지는지 확인합니다.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-black text-slate-400">확인 상태</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{doneCount}/{checks.length}</p>
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
          {checks.map((check) => (
            <div className="min-w-0 p-4" key={check.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">{check.label}</p>
                <Badge className={check.done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{check.done ? "확인" : "점검"}</Badge>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{check.helper}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0">
          <p className="text-sm font-black text-slate-950">바로 확인</p>
          <div className="mt-3 grid gap-2">
            {[
              { href: "/admin/system", label: "관리자 시스템 점검" },
              { href: dashboardHref, label: "고객사 대시보드" },
              { href: ledgerHref, label: "거래처 히스토리" },
              { href: routeHref, label: "지도 홈" }
            ].map((link) => (
              <Link
                className="flex h-10 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                href={link.href}
                key={link.label}
              >
                <span>{link.label}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreFlowCheckPanel({
  dashboardHref,
  dataHref,
  ledgerHref,
  mobileHref,
  routeHref
}: {
  dashboardHref: string;
  dataHref: string;
  ledgerHref: string;
  mobileHref: string;
  routeHref: string;
}) {
  const flows = [
    {
      href: "/admin/system",
      icon: Database,
      label: "관리자 점검",
      steps: ["환경변수", "저장 테이블", "Storage"],
      summary: "저장 연결과 필수 테이블 상태 확인"
    },
    {
      href: dashboardHref,
      icon: BarChart3,
      label: "고객사 대시보드",
      steps: ["거래처 수", "매출 기준", "코스 기준"],
      summary: "대표가 보는 운영 숫자 확인"
    },
    {
      href: dataHref,
      icon: Upload,
      label: "데이터 등록",
      steps: ["업로드", "매핑", "저장"],
      summary: "거래처와 매출 원장 등록"
    },
    {
      href: ledgerHref,
      icon: History,
      label: "거래처 히스토리",
      steps: ["기본정보", "첨부자료", "메모·방문"],
      summary: "매장별 원장과 현장 기록 확인"
    },
    {
      href: routeHref,
      icon: Route,
      label: "지도 홈",
      steps: ["지도", "차량 필터", "티맵 경유"],
      summary: "출발지-매장 거리와 경유 코스 확인"
    },
    {
      href: mobileHref,
      icon: ClipboardList,
      label: "모바일 현장",
      steps: ["오늘 코스", "적재위치", "완료 증빙"],
      summary: "직원이 현장에서 남기는 기록 확인"
    }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">핵심 플로우 점검</Badge>
            <h2 className="mt-3 text-lg font-black text-slate-950">실제 사용자가 누를 주요 경로</h2>
          </div>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            아래 6개 경로가 이어지면 등록, 원장, 지도, 리포트 흐름을 한 번에 확인할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="grid gap-3 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-3">
        {flows.map((flow, index) => {
          const Icon = flow.icon;
          return (
            <Link
              className="group rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:bg-teal-50/50 hover:shadow-sm"
              href={flow.href}
              key={flow.label}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-teal-700 text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-950">{index + 1}. {flow.label}</span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">{flow.summary}</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-teal-700" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {flow.steps.map((step) => (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-slate-200" key={step}>
                    {step}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DataRegistrationFlowCard({
  steps
}: {
  steps: Array<{
    description: string;
    done: boolean;
    label: string;
    value: string;
  }>;
}) {
  const completeCount = steps.filter((step) => step.done).length;
  const activeIndex = steps.findIndex((step) => !step.done);
  const currentIndex = activeIndex === -1 ? steps.length - 1 : activeIndex;
  const progress = Math.round((completeCount / steps.length) * 100);
  const currentStep = steps[currentIndex];
  const isComplete = completeCount === steps.length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200">운영 등록 플로우</Badge>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500 ring-1 ring-inset ring-slate-200">
                {completeCount}/{steps.length} 완료
              </span>
            </div>
            <h2 className="mt-3 text-lg font-black text-slate-950">데이터가 운영 화면에 반영되는 순서</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">등록 유형 선택부터 저장 확인까지 같은 기준으로 진행합니다.</p>
          </div>
          <div className={`rounded-lg border px-4 py-3 text-sm ${isComplete ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
            <p className={`text-xs font-black ${isComplete ? "text-emerald-700" : "text-blue-600"}`}>{isComplete ? "완료 상태" : "현재 진행 단계"}</p>
            <p className={`mt-1 font-black ${isComplete ? "text-emerald-950" : "text-blue-950"}`}>{currentStep.label}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <div className="grid gap-3 md:grid-cols-4">
            {steps.map((step, index) => (
              <div
                key={step.label}
                className={`min-h-[118px] rounded-lg border p-3 ${
                  step.done
                    ? "border-emerald-100 bg-emerald-50"
                    : index === currentIndex
                      ? "border-blue-200 bg-blue-50 ring-1 ring-blue-100"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                      step.done ? "bg-emerald-700 text-white" : index === currentIndex ? "bg-blue-700 text-white" : "bg-white text-slate-500"
                    }`}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      step.done
                        ? "bg-emerald-100 text-emerald-800"
                        : index === currentIndex
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {step.done ? "완료" : index === currentIndex ? "진행" : "대기"}
                  </span>
                </div>
                <p className="mt-3 text-sm font-black text-slate-950">{step.label}</p>
                <p className="mt-1 truncate text-xs font-black text-blue-700">{step.value}</p>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-500">
            <span>등록 진행률</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2">
            <Progress value={progress} />
          </div>
          <p className="mt-3 text-sm font-black text-slate-950">{completeCount}/{steps.length} 완료</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{currentStep.description}</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">다음 확인</p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {isComplete ? "거래처 히스토리와 리포트에서 반영 결과 확인" : `${currentStep.label} 단계 완료`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegistrationEntrySummary({
  activeType,
  canAnalyze,
  entryMode,
  persisted,
  rowsWaiting
}: {
  activeType: UploadTemplateType;
  canAnalyze: boolean;
  entryMode: EntryMode;
  persisted: boolean;
  rowsWaiting: number;
}) {
  const typeLabel = activeType === "customer-master" ? "거래처 기본정보" : "매출원장";
  const modeLabel = entryMode === "excel" ? "엑셀 대량" : entryMode === "manual" ? "수기 1건" : "OCR 보조";
  const stateLabel = persisted ? "저장 완료" : canAnalyze ? "저장 가능" : rowsWaiting ? "검수 필요" : "등록 전";
  const stateClassName = persisted
    ? "bg-emerald-100 text-emerald-800"
    : canAnalyze
      ? "bg-teal-100 text-teal-800"
      : rowsWaiting
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{typeLabel}</Badge>
      <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{modeLabel}</Badge>
      <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{rowsWaiting.toLocaleString()}행</Badge>
      <Badge className={stateClassName}>{stateLabel}</Badge>
    </div>
  );
}

function OperationalDataSplit({
  activeType,
  latestUploadAt,
  onSelect,
  rowsWaiting
}: {
  activeType: UploadTemplateType;
  latestUploadAt?: string;
  onSelect: (type: UploadTemplateType) => void;
  rowsWaiting: number;
}) {
  const cards = [
    {
      checks: ["사업자번호", "배송주소", "담당자", "첨부자료"],
      description: "지도, 배송차, 거래처 히스토리의 기준값",
      icon: Building2,
      key: "customer-master" as UploadTemplateType,
      label: "거래처 등록",
      rhythm: "최초 등록 후 수정",
      target: "지도 · 히스토리 · 배송"
    },
    {
      checks: ["거래처 key", "매출일자", "품목", "금액"],
      description: "등급, 이탈, 리포트 수치를 갱신하는 반복 데이터",
      icon: Banknote,
      key: "sales-analysis" as UploadTemplateType,
      label: "매출 원장",
      rhythm: "일·월·분기 업로드",
      target: "등급 · 원장 · 리포트"
    }
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Badge className="mb-2 bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200">등록 유형</Badge>
          <h2 className="text-xl font-black text-slate-950">거래처 기준값과 매출 원장을 구분합니다</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">거래처는 처음 저장하고, 매출은 주기적으로 갱신합니다.</p>
        </div>
        <div className="grid gap-2 text-xs font-black text-slate-500 sm:grid-cols-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">대기 {rowsWaiting.toLocaleString()}행</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">최근 {latestUploadAt || "없음"}</span>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const active = activeType === card.key;

          return (
            <button
              key={card.key}
              className={`border-b p-4 text-left transition last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${
                active ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              onClick={() => onSelect(card.key)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${active ? "bg-white/10 text-white ring-1 ring-inset ring-white/20" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-base font-black ${active ? "text-white" : "text-slate-950"}`}>{card.label}</p>
                    <p className={`mt-1 text-xs font-bold leading-5 ${active ? "text-white/70" : "text-slate-500"}`}>{card.rhythm}</p>
                  </div>
                </div>
                {active ? <CheckCircle2 className="h-5 w-5 shrink-0 text-white" /> : <Badge className="bg-slate-100 text-slate-600">선택</Badge>}
              </div>
              <div className="mt-4 grid overflow-hidden rounded-md border border-slate-200 bg-white md:grid-cols-2">
                <div className="border-b border-slate-200 px-3 py-2 md:border-b-0 md:border-r">
                  <p className="text-[11px] font-black text-slate-400">주기</p>
                  <p className="mt-1 text-xs font-black text-slate-950">{card.rhythm}</p>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[11px] font-black text-slate-400">반영</p>
                  <p className="mt-1 text-xs font-black text-slate-950">{card.target}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {card.checks.map((check) => (
                  <span key={check} className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-slate-200">
                    {check}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataRegistrationDecisionPanel({
  activeType,
  entryMode,
  latestUploadAt,
  rowsWaiting
}: {
  activeType: UploadTemplateType;
  entryMode: EntryMode;
  latestUploadAt?: string;
  rowsWaiting: number;
}) {
  const activeLabel = activeType === "customer-master" ? "거래처 등록" : "매출 원장";
  const modeLabel = entryMode === "excel" ? "엑셀 대량 등록" : entryMode === "manual" ? "수기 1건 등록" : "OCR 보조 입력";
  const syncTarget = activeType === "customer-master" ? "지도 · 거래처 히스토리 · 배송 코스" : "매출 원장 · 등급 · AI 리포트";
  const modeHint =
    entryMode === "excel"
      ? "ERP 헤더 매핑 후 일괄 저장"
      : entryMode === "manual"
        ? "주소 검색과 사업자번호 검증 후 1건 저장"
        : "OCR 후보값 확인 후 수기 보정";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Badge className="mb-2 bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">현재 작업</Badge>
          <h2 className="text-lg font-black text-slate-950">{activeLabel} · {modeLabel}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{modeHint} · {syncTarget}</p>
        </div>
        <div className="grid gap-2 text-xs font-black text-slate-600 sm:grid-cols-2">
          <span className="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">대기 {rowsWaiting.toLocaleString()}행</span>
          <span className="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">최근 {latestUploadAt || "없음"}</span>
        </div>
      </div>
      <div className="grid gap-0 md:grid-cols-3">
        <MiniDecisionMetric icon={Building2} label="등록 유형" value={activeLabel} />
        <MiniDecisionMetric icon={FileSpreadsheet} label="등록 방식" value={modeLabel} />
        <MiniDecisionMetric icon={Save} label="반영 위치" value={syncTarget} />
      </div>
    </div>
  );
}

function MiniDecisionMetric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex min-h-[82px] items-center gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-black leading-5 text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function DocumentOcrRegistrationPanel({
  filename,
  isManualSaving,
  lastManualCustomer,
  manualComplete,
  manualDraft,
  ocrMeta,
  ocrStatus,
  previewUrl,
  onDocumentFile,
  onManualChange,
  onManualSave
}: {
  filename: string;
  isManualSaving: boolean;
  lastManualCustomer: { id: string; name: string } | null;
  manualComplete: boolean;
  manualDraft: RawRow;
  ocrMeta: OcrMeta | null;
  ocrStatus: string;
  previewUrl?: string;
  onDocumentFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onManualChange: (draft: RawRow) => void;
  onManualSave: () => void | Promise<void>;
}) {
  const extractedFields = [
    ["상호명", "customerName"],
    ["사업자등록번호", "businessRegistrationNumber"],
    ["대표자명", "representativeName"],
    ["개업일", "openingDate"],
    ["배송주소", "address"],
    ["업종", "industry"],
    ["연락처", "phone"],
    ["이메일", "email"]
  ] as const;
  const confidencePercent = ocrMeta ? Math.round(ocrMeta.confidence * 100) : 0;
  const providerLabel = getOcrProviderLabel(ocrMeta?.provider);
  const ocrModeLabel = ocrMeta?.mode === "sample" || ocrMeta?.mode === "assistive-check" ? "보조 검증" : ocrMeta?.mode === "provider-ready" ? "공급자 준비" : ocrMeta?.mode || "대기";

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <label className="flex min-h-48 cursor-pointer flex-col justify-between rounded-md border-2 border-dashed border-teal-200 bg-teal-50/60 p-4 transition hover:bg-teal-50">
          <span>
            <span className="grid h-11 w-11 place-items-center rounded-md bg-white text-teal-700 ring-1 ring-inset ring-teal-100">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <span className="mt-4 block text-base font-black text-slate-950">OCR 보조 입력</span>
            <span className="mt-2 block text-sm font-semibold leading-6 text-slate-500">서류가 있으면 후보값을 채우고, 없으면 수기 등록으로 바로 진행합니다.</span>
          </span>
          <span className="mt-4 w-fit rounded-md bg-white px-3 py-2 text-xs font-black text-teal-700">파일 선택</span>
          <input className="sr-only" type="file" accept="image/*,.pdf" onChange={onDocumentFile} />
        </label>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
          <p className="font-black text-amber-900">개인정보 기준</p>
          <p className="mt-1">신분증은 필요할 때만 첨부하고 민감정보는 마스킹 후 보관합니다.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge className="mb-2 bg-teal-100 text-teal-800">보조 입력값</Badge>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-950">{filename || "서류 업로드 대기"}</h3>
                {previewUrl ? (
                  <a
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2.5 text-xs font-black text-teal-700 hover:bg-teal-100"
                    href={previewUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    새창 미리보기
                  </a>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{ocrStatus || "OCR은 선택 기능입니다. 저장 전 후보값을 사람이 확인합니다."}</p>
              {previewUrl ? <p className="mt-1 text-xs font-bold text-slate-400">새창에서 서류 원본을 보며 아래 값을 직접 입력하거나 OCR 후보값을 검증하세요.</p> : null}
            </div>
            <Button className="shrink-0" onClick={onManualSave} disabled={!manualComplete || isManualSaving}>
              <Save size={18} />
              {isManualSaving ? "저장 중" : "확인 후 매장 생성"}
            </Button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <MiniStatus label="OCR 상태" value={ocrModeLabel} />
            <MiniStatus label="공급자" value={providerLabel} />
            <MiniStatus label="추출 신뢰도" value={ocrMeta ? `${confidencePercent}%` : "대기"} />
          </div>
          {ocrMeta?.warnings.length ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-black text-amber-900">저장 전 확인사항</p>
              <div className="mt-2 space-y-1">
                {ocrMeta.warnings.map((warning) => (
                  <p key={warning} className="text-xs font-semibold leading-5 text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {extractedFields.map(([label, key]) => (
              <label key={key} className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs font-black text-slate-500">{label}</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => onManualChange({ ...manualDraft, [key]: event.target.value })}
                  value={String(manualDraft[key] ?? "")}
                />
              </label>
            ))}
          </div>
        </div>

        {lastManualCustomer ? (
          <CustomerAttachmentUploadPanel customerId={lastManualCustomer.id} customerName={lastManualCustomer.name} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">첨부자료</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              사업자등록증, 신분증, 통장사본, 배송 적재위치 파일은 위 정보를 확인하고 &quot;확인 후 매장 생성&quot;을 눌러 저장한 뒤 업로드할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceLinkCapturePanel({
  fields,
  manualDraft,
  onManualChange
}: {
  fields: UploadTemplateField[];
  manualDraft: RawRow;
  onManualChange: (draft: RawRow) => void;
}) {
  const customerName = String(manualDraft.customerName || "").trim();
  const address = String(manualDraft.address || "").trim();
  const searchLinks = buildPlaceSearchLinks(customerName, address);
  const filledCount = fields.filter((field) => String(manualDraft[field.key] ?? "").trim()).length;

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/80 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Badge className="mb-2 bg-white text-teal-800 ring-1 ring-inset ring-teal-200">운영 링크</Badge>
          <h3 className="text-base font-black text-slate-950">매장 외부 정보 링크</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">리뷰, 영업시간, 폐업 여부 확인용 선택값입니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {searchLinks.map((link) => (
            <a
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-black transition ${
                customerName || address ? "border-teal-200 bg-white text-teal-800 hover:bg-teal-100" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
              }`}
              href={link.href}
              key={link.label}
              rel="noreferrer"
              target="_blank"
            >
              {link.label} 검색
            </a>
          ))}
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="grid gap-0 md:grid-cols-3">
          {fields.map((field) => (
            <label key={field.key} className="space-y-1.5 border-b border-slate-200 bg-white p-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <span className="text-xs font-black text-slate-500">{field.label}</span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-200"
                inputMode="url"
                onChange={(event) => onManualChange({ ...manualDraft, [field.key]: event.target.value })}
                placeholder="https://..."
                type="url"
                value={String(manualDraft[field.key] ?? "")}
              />
              <span className="block truncate text-xs font-bold leading-5 text-slate-500">{field.description}</span>
            </label>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-3 lg:border-l lg:border-t-0">
          <p className="text-xs font-black text-slate-500">등록 상태</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{filledCount}/{fields.length}</p>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">선택값 · 나중에 보완 가능</p>
        </div>
      </div>
    </div>
  );
}

function ManualSaveResultCard({ href, message, persisted }: { href: string; message: string; persisted: boolean }) {
  const tone = persisted
    ? {
        badge: "저장 완료",
        className: "border-emerald-200 bg-emerald-50",
        iconClassName: "bg-emerald-700 text-white",
        textClassName: "text-emerald-900"
      }
    : {
        badge: "저장 확인 필요",
        className: "border-amber-200 bg-amber-50",
        iconClassName: "bg-amber-500 text-white",
        textClassName: "text-amber-900"
      };

  return (
    <div className={`mt-3 rounded-lg border p-3 ${tone.className}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tone.iconClassName}`}>
            {persisted ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <Badge className="w-fit bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{tone.badge}</Badge>
            <p className={`mt-1 text-sm font-black leading-6 ${tone.textClassName}`}>{message}</p>
            <p className="mt-0.5 text-xs font-bold leading-5 text-slate-600">
            {persisted ? "이제 첨부자료를 보완하거나 거래처 히스토리에서 원장 내용을 확인하세요." : "로그인, 서버 환경변수, Supabase 상태를 확인한 뒤 다시 저장하세요."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {href ? (
            <Link className="maju-button-primary inline-flex h-9 items-center justify-center px-3 text-xs" href={href}>
              거래처 원장 열기
            </Link>
          ) : null}
          <Link className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50" href="/admin/system">
            저장 상태 확인
          </Link>
        </div>
      </div>
    </div>
  );
}

function ManualEntryProgress({
  addressSelected,
  businessNumber,
  businessNumberValid,
  missingFields,
  ready
}: {
  addressSelected: boolean;
  businessNumber: string;
  businessNumberValid: boolean;
  missingFields: UploadTemplateField[];
  ready: boolean;
}) {
  const items = [
    {
      detail: missingFields.length ? `${missingFields.map((field) => field.label).join(", ")} 입력 필요` : "필수값 완료",
      label: "필수값",
      ok: missingFields.length === 0
    },
    {
      detail: addressSelected ? "배송주소 입력 완료" : "거래처명 검색 또는 직접 입력",
      label: "주소",
      ok: addressSelected
    },
    {
      detail: businessNumber ? (businessNumberValid ? "사업자번호 검증 완료" : "10자리 번호 확인") : "선택 입력 · 서류로 나중에 보완 가능",
      label: "사업자번호",
      ok: businessNumberValid
    }
  ];
  const doneCount = items.filter((item) => item.ok).length;

  return (
    <div className={`mt-4 overflow-hidden rounded-md border ${ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-col gap-2 border-b border-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">수기 등록 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">필수값, 주소, 사업자번호 확인 후 저장합니다.</p>
        </div>
        <Badge className={ready ? "bg-emerald-700 text-white" : "bg-blue-700 text-white"}>
          {doneCount}/3 완료
        </Badge>
      </div>
      <div className="grid divide-y divide-slate-100 bg-white md:grid-cols-3 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className={`px-4 py-3 ${item.ok ? "bg-emerald-50/70 text-emerald-900" : "bg-white text-slate-700"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black">{item.label}</span>
              {item.ok ? <Check className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-slate-400" />}
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulkEntryProgress({
  complete,
  hasBlockingQualityIssues,
  mappedRequiredCount,
  requiredCount,
  rows
}: {
  complete: boolean;
  hasBlockingQualityIssues: boolean;
  mappedRequiredCount: number;
  requiredCount: number;
  rows: number;
}) {
  const hasRows = rows > 0;
  const mappingReady = hasRows && mappedRequiredCount >= requiredCount;
  const qualityReady = hasRows && mappingReady && !hasBlockingQualityIssues;
  const items = [
    {
      detail: hasRows ? `${rows.toLocaleString()}행 업로드됨` : "엑셀 파일 필요",
      label: "파일",
      ok: hasRows
    },
    {
      detail: `${mappedRequiredCount}/${requiredCount} 필수 연결`,
      label: "매핑",
      ok: mappingReady
    },
    {
      detail: hasRows ? (hasBlockingQualityIssues ? "보완 필요 행 확인" : "차단 오류 없음") : "업로드 후 확인",
      label: "품질",
      ok: qualityReady
    },
    {
      detail: complete ? "상단 저장 실행 가능" : "조건 충족 대기",
      label: "저장",
      ok: complete
    }
  ];
  const doneCount = items.filter((item) => item.ok).length;

  return (
    <div className={`maju-section-card mt-3 overflow-hidden ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-col gap-2 border-b border-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">대량 등록 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">파일, 매핑, 품질 검증 후 저장을 실행합니다.</p>
        </div>
        <Badge className={complete ? "bg-emerald-700 text-white" : "bg-teal-700 text-white"}>
          {doneCount}/4 완료
        </Badge>
      </div>
      <div className="grid divide-y divide-slate-100 bg-white md:grid-cols-4 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className={`px-4 py-3 ${item.ok ? "bg-emerald-50/70 text-emerald-900" : "bg-white text-slate-700"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black">{item.label}</span>
              {item.ok ? <Check className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-slate-400" />}
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-500" title={item.detail}>{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulkNextActionPanel({
  canAnalyze,
  hasBlockingQualityIssues,
  missingRequiredFields,
  onOpenTab,
  rows
}: {
  canAnalyze: boolean;
  hasBlockingQualityIssues: boolean;
  missingRequiredFields: UploadTemplateField[];
  onOpenTab: (tab: "mapping" | "quality" | "save") => void;
  rows: number;
}) {
  const hasRows = rows > 0;
  const nextAction = !hasRows
    ? {
        badge: "파일 필요",
        body: "먼저 거래처 또는 매출 원장 엑셀을 업로드하세요.",
        buttonLabel: "업로드 후 매핑 확인",
        disabled: true,
        icon: Upload,
        tab: "mapping" as const,
        title: "엑셀 파일을 기다리고 있습니다."
      }
    : missingRequiredFields.length
      ? {
          badge: "매칭 필요",
          body: `${missingRequiredFields.map((field) => field.label).join(", ")} 필수 필드를 연결하면 저장 조건이 열립니다.`,
          buttonLabel: "필드 매칭 열기",
          disabled: false,
          icon: FileSpreadsheet,
          tab: "mapping" as const,
          title: "필수 필드 연결이 남아 있습니다."
        }
      : hasBlockingQualityIssues
        ? {
            badge: "검수 필요",
            body: "중복 후보, 누락값, 사업자번호 오류를 확인한 뒤 저장하는 것이 안전합니다.",
            buttonLabel: "데이터 검수 열기",
            disabled: false,
            icon: AlertTriangle,
            tab: "quality" as const,
            title: "보완 필요 행을 확인하세요."
          }
        : {
            badge: canAnalyze ? "저장 가능" : "저장 확인",
            body: "원장 저장과 AI 리포트 갱신을 실행할 준비가 됐습니다.",
            buttonLabel: "저장 열기",
            disabled: false,
            icon: Check,
            tab: "save" as const,
            title: "운영 데이터 반영 준비가 끝났습니다."
          };
  const Icon = nextAction.icon;

  return (
    <div className="maju-section-card mt-3 overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex items-center gap-3 p-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${nextAction.disabled ? "bg-slate-100 text-slate-500" : "bg-blue-700 text-white"}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Badge className={nextAction.disabled ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}>{nextAction.badge}</Badge>
            <p className="mt-1 text-sm font-black text-slate-950">{nextAction.title}</p>
            <p className="mt-1 truncate text-xs font-semibold leading-5 text-slate-500" title={nextAction.body}>{nextAction.body}</p>
          </div>
        </div>
        <div className="flex items-center border-t border-slate-100 bg-slate-50 p-3 lg:border-l lg:border-t-0">
          <Button
            className="h-10 w-full"
            disabled={nextAction.disabled}
            onClick={() => onOpenTab(nextAction.tab)}
            type="button"
          >
            {nextAction.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ManualValidationPanel({
  addressSelected,
  businessNumber,
  businessNumberValid,
  isManualSaving,
  isMaster,
  lastManualCustomerHref,
  manualSaveMessage,
  missingFields,
  onManualSave,
  ready
}: {
  addressSelected: boolean;
  businessNumber: string;
  businessNumberValid: boolean;
  isManualSaving: boolean;
  isMaster: boolean;
  lastManualCustomerHref: string;
  manualSaveMessage: string;
  missingFields: UploadTemplateField[];
  onManualSave: () => void | Promise<void>;
  ready: boolean;
}) {
  const checks = [
    {
      description: missingFields.length ? `${missingFields.map((field) => field.label).join(", ")} 입력 필요` : "필수값이 모두 입력되었습니다.",
      label: "필수값",
      ok: missingFields.length === 0
    },
    {
      description: isMaster ? (addressSelected ? "배송주소가 입력되었습니다." : "거래처명 검색으로 자동 반영하거나 배송주소를 직접 입력하세요.") : "매출 데이터는 거래처 key 기준으로 저장됩니다.",
      label: "주소",
      ok: !isMaster || addressSelected
    },
    {
      description: isMaster
        ? businessNumber
          ? businessNumberValid
            ? `${formatBusinessRegistrationNumber(businessNumber)} 확인 완료`
            : "사업자번호 체크값이 맞지 않습니다."
          : "선택 입력입니다. 지금 없으면 저장 후 사업자등록증으로 등록해도 됩니다."
        : "매출 업로드에서는 선택값입니다.",
      label: "사업자번호",
      ok: !isMaster || businessNumberValid
    }
  ];

  const doneCount = checks.filter((check) => check.ok).length;
  const primaryCopy = ready ? "저장 가능" : `${doneCount}/${checks.length} 확인`;
  const nextCopy = ready ? "저장하면 거래처 원장과 지도 기준값에 반영됩니다." : checks.find((check) => !check.ok)?.description || "입력값을 확인하세요.";

  return (
    <aside className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
      <div className={`border-b px-4 py-3 ${ready ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-black text-slate-950">
              <ClipboardList className={ready ? "h-4 w-4 text-emerald-700" : "h-4 w-4 text-amber-700"} />
              수기 저장
            </p>
            <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-600">{nextCopy}</p>
          </div>
          <Badge className={ready ? "shrink-0 bg-emerald-100 text-emerald-800" : "shrink-0 bg-amber-100 text-amber-800"}>{primaryCopy}</Badge>
        </div>
      </div>

      <div className="grid gap-2 p-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`rounded-md border px-3 py-2 ${check.ok ? "border-emerald-100 bg-emerald-50/70" : "border-amber-100 bg-white"}`}
            title={check.description}
          >
            <div className="flex items-center gap-2">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${check.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {check.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 truncate text-xs font-black text-slate-900">{check.label}</span>
            </div>
          </div>
        ))}
      </div>

      {manualSaveMessage ? (
        <div className="border-t border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-black text-blue-700">최근 저장 결과</p>
          <p className="mt-1 line-clamp-3 text-xs font-bold leading-5 text-slate-800">{manualSaveMessage}</p>
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-slate-200 p-3">
        <Button className="h-11 w-full" onClick={onManualSave} disabled={!ready || isManualSaving}>
          <Save size={18} />
          {isManualSaving ? "저장 중" : ready ? "거래처 저장" : "검증 완료 후 저장"}
        </Button>
        {lastManualCustomerHref ? (
          <Link
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-accent hover:text-accent-foreground"
            href={lastManualCustomerHref}
          >
            히스토리에서 확인
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function UploadStatusCard({
  complete,
  filename,
  headers,
  mappedRequiredCount,
  mappingProgress,
  requiredCount,
  rows
}: {
  complete: boolean;
  filename: string;
  headers: string[];
  mappedRequiredCount: number;
  mappingProgress: number;
  requiredCount: number;
  rows: RawRow[];
}) {
  const hasRows = rows.length > 0;

  return (
    <div className="h-full overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-400">{hasRows ? "업로드됨" : "대기 중"}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{hasRows ? filename : "아직 등록할 데이터가 없습니다."}</p>
        </div>
        <Badge className={complete && hasRows ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {complete && hasRows ? "저장 가능" : "확인 필요"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3">
          <p className="text-[11px] font-black text-slate-400">행</p>
          <p className="mt-1 text-sm font-black text-slate-950">{rows.length}개</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-black text-slate-400">컬럼</p>
          <p className="mt-1 text-sm font-black text-slate-950">{headers.length}개</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] font-black text-slate-400">필수</p>
          <p className="mt-1 text-sm font-black text-slate-950">{mappedRequiredCount}/{requiredCount}</p>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="mb-1 flex justify-between text-xs font-black text-slate-500">
          <span>필수 매핑</span>
          <span>{mappingProgress}%</span>
        </div>
        <Progress value={mappingProgress} />
      </div>
    </div>
  );
}

function RegistrationStatusCard({ status }: { status: RegistrationStatus }) {
  const tone = {
    error: {
      badge: "bg-rose-100 text-rose-800",
      border: "border-rose-200 bg-rose-50",
      icon: <AlertTriangle className="h-5 w-5 text-rose-700" />
    },
    idle: {
      badge: "bg-slate-100 text-slate-700",
      border: "border-slate-200 bg-slate-50",
      icon: <Clock className="h-5 w-5 text-slate-500" />
    },
    ready: {
      badge: "bg-blue-100 text-blue-800",
      border: "border-blue-200 bg-blue-50",
      icon: <Check className="h-5 w-5 text-blue-700" />
    },
    running: {
      badge: "bg-violet-100 text-violet-800",
      border: "border-violet-200 bg-violet-50",
      icon: <Activity className="h-5 w-5 animate-pulse text-violet-700" />
    },
    success: {
      badge: "bg-emerald-100 text-emerald-800",
      border: "border-emerald-200 bg-emerald-50",
      icon: <Check className="h-5 w-5 text-emerald-700" />
    },
    warning: {
      badge: "bg-amber-100 text-amber-800",
      border: "border-amber-200 bg-amber-50",
      icon: <AlertTriangle className="h-5 w-5 text-amber-700" />
    }
  }[status.status];

  return (
    <div className={`h-full overflow-hidden rounded-md border ${tone.border}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white shadow-sm">{tone.icon}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{status.title}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-600">{status.description}</p>
          </div>
        </div>
        <Badge className={`shrink-0 ${tone.badge}`}>{status.actionLabel}</Badge>
      </div>
      <div className="bg-white/80 px-4 py-3">
        <p className="text-[11px] font-black text-slate-400">다음 액션</p>
        <p className="mt-1 text-sm font-black leading-5 text-slate-900">{status.nextAction}</p>
      </div>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-white px-3 py-2.5">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function DataQualityCard({
  onDownloadIssues,
  onOpenSaveReview,
  summary
}: {
  onDownloadIssues: () => void;
  onOpenSaveReview: () => void;
  summary: DataQualitySummary;
}) {
  const [issuePage, setIssuePage] = useState(1);
  const [issuePageSize, setIssuePageSize] = useState<ListPageSize>(10);
  const hasRows = summary.rows > 0;
  const hasRowIssues = summary.issueRows.length > 0 || summary.invalidBusinessNumbers.length > 0;
  const hasIssues = hasRowIssues || summary.duplicateCandidates > 0;
  const rowIssueCount = new Set([...summary.issueRows.map((issue) => issue.rowNumber), ...summary.invalidBusinessNumbers.map((issue) => issue.rowNumber)]).size;
  const issuePreview = [
    ...summary.issueRows.map((issue) => ({
      detail: `${issue.missingLabels.join(", ")} 값이 비어 있습니다.`,
      rowNumber: issue.rowNumber,
      tone: "amber" as const,
      type: "필수값 누락"
    })),
    ...summary.invalidBusinessNumbers.map((issue) => ({
      detail: `${issue.value || "빈 값"}은 유효한 10자리 사업자번호가 아닙니다.`,
      rowNumber: issue.rowNumber,
      tone: "rose" as const,
      type: "사업자번호 오류"
    }))
  ].sort((a, b) => a.rowNumber - b.rowNumber);
  const issueTotalPages = Math.max(1, Math.ceil(issuePreview.length / issuePageSize));
  const currentIssuePage = Math.min(issuePage, issueTotalPages);
  const issueStart = (currentIssuePage - 1) * issuePageSize;
  const visibleIssues = issuePreview.slice(issueStart, issueStart + issuePageSize);
  const issuePageStart = issuePreview.length ? issueStart + 1 : 0;
  const issuePageEnd = Math.min(issuePreview.length, issueStart + issuePageSize);

  return (
    <div className={`maju-section-card mb-4 overflow-hidden ${hasIssues ? "border-amber-200" : "border-emerald-100"}`}>
      <div className={`flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${hasIssues ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            {hasIssues ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <Check className="h-4 w-4 text-emerald-700" />}
            행 데이터 품질
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{hasRows ? "누락, 사업자번호, 중복 후보를 확인합니다." : "업로드 후 행 단위 검증 결과가 표시됩니다."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={hasIssues ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{hasIssues ? "보완 권장" : "정상"}</Badge>
          {hasRowIssues ? (
            <Button className="h-8 bg-white text-slate-900" onClick={onDownloadIssues} size="sm" variant="outline">
              <Download className="h-4 w-4" />
              보완 파일
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
        <QualityMetric label="정상" value={`${summary.readyRows.toLocaleString()}행`} />
        <QualityMetric label="보완" value={`${rowIssueCount.toLocaleString()}행`} />
        <QualityMetric label="사업자번호" value={`${summary.invalidBusinessNumbers.length.toLocaleString()}건`} />
        <QualityMetric label="중복" value={`${summary.duplicateCandidates.toLocaleString()}건`} />
      </div>
      <div className="border-t border-slate-100 p-4">
        {!hasRows ? (
          <div className="maju-empty-state p-4 text-center">
            <p className="text-sm font-black text-slate-950">검증할 행이 아직 없습니다.</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">엑셀 업로드 또는 수기 등록을 완료하면 저장 가능 여부가 이곳에 표시됩니다.</p>
          </div>
        ) : hasRowIssues ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950">보완 대상</p>
                <p className="mt-1 text-xs font-bold text-slate-500">저장 전 아래 행을 먼저 확인하세요.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                  보기
                  <select
                    className="h-6 border-0 bg-transparent p-0 text-xs font-black text-slate-900 outline-none focus:ring-0"
                    onChange={(event) => {
                      setIssuePageSize(Number(event.target.value) as ListPageSize);
                      setIssuePage(1);
                    }}
                    value={issuePageSize}
                  >
                    {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}개
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                  {issuePageStart.toLocaleString()}-{issuePageEnd.toLocaleString()} / {issuePreview.length.toLocaleString()}건
                </span>
                <button
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={currentIssuePage <= 1}
                  onClick={() => setIssuePage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  이전
                </button>
                <span className="text-xs font-black text-slate-400">
                  {currentIssuePage.toLocaleString()} / {issueTotalPages.toLocaleString()}
                </span>
                <button
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={currentIssuePage >= issueTotalPages}
                  onClick={() => setIssuePage((page) => Math.min(issueTotalPages, page + 1))}
                  type="button"
                >
                  다음
                </button>
                <Button className="bg-teal-700 text-white hover:bg-teal-800" onClick={onDownloadIssues} size="sm">
                  <Download className="h-4 w-4" />
                  문제 행 다운로드
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="max-h-[320px] overflow-auto">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                    <tr>
                      <th className="w-[92px] border-r border-slate-200 px-3 py-2.5 font-black">행</th>
                      <th className="w-[150px] border-r border-slate-200 px-3 py-2.5 font-black">유형</th>
                      <th className="border-r border-slate-200 px-3 py-2.5 font-black">보완 내용</th>
                      <th className="w-[120px] px-3 py-2.5 font-black">조치</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleIssues.map((issue) => (
                      <tr key={`${issue.type}-${issue.rowNumber}`} className="align-top hover:bg-slate-50">
                        <td className="border-r border-slate-100 px-3 py-2.5 font-black text-slate-950">{issue.rowNumber}행</td>
                        <td className="border-r border-slate-100 px-3 py-2.5">
                          <Badge className={issue.tone === "rose" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}>{issue.type}</Badge>
                        </td>
                        <td className="border-r border-slate-100 px-3 py-2.5 font-bold leading-5 text-slate-700">{issue.detail}</td>
                        <td className="px-3 py-2.5 font-black text-amber-700">재업로드</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {issuePreview.length > visibleIssues.length ? <p className="text-xs font-bold text-amber-700">다른 문제 행은 다음 페이지에서 계속 확인하거나 다운로드 파일로 볼 수 있습니다.</p> : null}
          </div>
        ) : (
          <div className="grid gap-3 rounded-md border border-emerald-100 bg-emerald-50 p-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
            <div>
              <p className="text-sm font-black text-emerald-900">저장 차단 오류 없음</p>
              <p className="mt-1 text-xs font-bold leading-5 text-emerald-700">중복 후보만 확인한 뒤 저장 단계로 이동하세요.</p>
            </div>
            <Badge className="w-fit bg-white text-emerald-800 ring-1 ring-inset ring-emerald-100">검수 완료</Badge>
          </div>
        )}
        {summary.duplicateCandidates > 0 ? (
          <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-xs font-black text-blue-900">중복 후보 {summary.duplicateCandidates.toLocaleString()}개</p>
            <p className="mt-1 text-xs font-bold leading-5 text-blue-700">기존 거래처 업데이트인지 신규 등록인지 확인하세요.</p>
          </div>
        ) : null}
        {hasRows ? (
          <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div>
              <p className="text-sm font-black text-slate-950">{hasRowIssues ? "보완 후 저장 단계로 이동하세요." : "저장 단계로 이동할 수 있습니다."}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{hasRowIssues ? "문제 행을 수정한 뒤 다시 업로드하세요." : "저장 결과와 운영 화면 연결을 최종 확인합니다."}</p>
            </div>
            <Button className="h-11" disabled={hasRowIssues} onClick={onOpenSaveReview} type="button">
              저장 확인으로 이동
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QualityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function SaveReadinessPanel({
  canAnalyze,
  dashboardHref,
  items,
  ledgerHref,
  ledgerLabel,
  persisted,
  routeHref,
  typeLabel
}: {
  canAnalyze: boolean;
  dashboardHref: string;
  items: Array<{ detail: string; label: string; ok: boolean }>;
  ledgerHref: string;
  ledgerLabel: string;
  persisted: boolean;
  routeHref: string;
  typeLabel: string;
}) {
  const readyCount = items.filter((item) => item.ok).length;
  const blockingItems = items.filter((item) => !item.ok && item.label !== "저장 확인");
  const progress = items.length ? Math.round((readyCount / items.length) * 100) : 0;
  const nextStep =
    blockingItems[0]?.label ||
    (canAnalyze ? "저장 실행" : items.find((item) => !item.ok)?.label || "화면 확인");

  return (
    <div className={`overflow-hidden rounded-md border bg-white ${canAnalyze ? "border-emerald-200" : "border-amber-200"}`}>
      <div className={`grid gap-4 border-b px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center ${canAnalyze ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-black text-slate-950">
              {canAnalyze ? <Check className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
              저장 점검
            </p>
            <Badge className={canAnalyze ? "bg-emerald-700 text-white" : "bg-amber-500 text-white"}>
              {canAnalyze ? "실행 가능" : "확인 필요"}
            </Badge>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {canAnalyze ? "저장하면 원장, 지도, 리포트가 같은 기준으로 갱신됩니다." : `${blockingItems.map((item) => item.label).join(", ") || "저장"} 조건을 먼저 확인하세요.`}
          </p>
        </div>
        <div className="rounded-md border border-white/70 bg-white/85 p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-black text-slate-500">
            <span>저장 준비율</span>
            <span>{progress}%</span>
          </div>
          <Progress className="mt-2" value={progress} />
          <p className="mt-2 text-xs font-black text-slate-800">{readyCount}/{items.length} 조건 충족 · 다음: {nextStep}</p>
        </div>
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-[160px] border-b border-r border-slate-200 px-4 py-3 font-black">확인 항목</th>
              <th className="w-[120px] border-b border-r border-slate-200 px-4 py-3 font-black">상태</th>
              <th className="border-b border-slate-200 px-4 py-3 font-black">내용</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.label} className="hover:bg-slate-50">
                <td className="border-b border-r border-slate-100 px-4 py-3 font-black text-slate-950">{item.label}</td>
                <td className="border-b border-r border-slate-100 px-4 py-3">
                  <Badge className={item.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{item.ok ? "완료" : "대기"}</Badge>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 font-bold leading-5 text-slate-600">{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-white px-4 py-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-slate-500">저장 후 확인</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-700">{typeLabel} 저장 결과를 아래 화면에서 확인합니다.</p>
          </div>
          <Badge className={persisted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
            {persisted ? "확인 가능" : "저장 후 활성"}
          </Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            { href: dashboardHref, label: "대시보드", value: "회사 현황 숫자 갱신" },
            { href: ledgerHref, label: ledgerLabel.replace(" 보기", ""), value: "등록 원장 확인" },
            { href: routeHref, label: "지도 홈", value: "위치·코스 확인" }
          ].map((item, index) => (
            <Link
              className={`rounded-md border px-3 py-3 transition ${persisted ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100/70" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
              href={item.href}
              key={item.label}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-slate-400">{index + 1}차 확인</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <span className="mt-1 block text-sm font-black text-slate-950">{item.label}</span>
              <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{item.value}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SaveResultSummary({
  canAnalyze,
  ledgerHref,
  ledgerLabel,
  missingRequiredFields,
  persisted,
  registrationStatus,
  rows
}: {
  canAnalyze: boolean;
  ledgerHref: string;
  ledgerLabel: string;
  missingRequiredFields: readonly UploadTemplateField[];
  persisted: boolean;
  registrationStatus: RegistrationStatus;
  rows: number;
}) {
  const mode = persisted ? "persisted" : canAnalyze ? "ready" : rows ? "blocked" : "empty";
  const copy = {
    blocked: {
      badge: "확인 필요",
      body: missingRequiredFields.length ? `${missingRequiredFields.map((field) => field.label).join(", ")} 필수 컬럼을 연결해야 저장할 수 있습니다.` : "품질 검증 탭에서 보완 필요 행을 확인하세요.",
      className: "border-amber-200 bg-amber-50",
      icon: <AlertTriangle className="h-4 w-4 text-amber-700" />,
      title: "아직 저장 실행 조건이 부족합니다."
    },
    empty: {
      badge: "등록 대기",
      body: "대량 등록은 엑셀을 올리고, 신규 1건은 수기 등록을 완료하면 저장 실행이 가능합니다.",
      className: "border-slate-200 bg-slate-50",
      icon: <Clock className="h-4 w-4 text-slate-500" />,
      title: "등록할 데이터가 아직 없습니다."
    },
    persisted: {
      badge: "저장 완료",
      body: "저장이 확인됐습니다. 운영 화면에서 같은 데이터 기준으로 확인할 수 있습니다.",
      className: "border-emerald-200 bg-emerald-50",
      icon: <Check className="h-4 w-4 text-emerald-700" />,
      title: "데이터 등록이 운영 화면에 반영됐습니다."
    },
    ready: {
      badge: "저장 가능",
      body: "저장 실행을 누르면 원장 저장과 리포트 갱신을 함께 시도합니다.",
      className: "border-blue-200 bg-blue-50",
      icon: <Check className="h-4 w-4 text-blue-700" />,
      title: "저장 실행 준비가 끝났습니다."
    }
  }[mode];
  const primaryAction = persisted
    ? { href: ledgerHref, label: `${ledgerLabel}에서 확인`, tone: "solid" as const }
    : canAnalyze
      ? { href: "#save-check", label: "저장 실행 후 확인", tone: "muted" as const }
      : { href: "#mapping-panel", label: "조건 보완하기", tone: "muted" as const };

  return (
    <div className={`rounded-md border p-3 ${copy.className}`} id="save-check">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{copy.badge}</Badge>
          <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-950">
            {copy.icon}
            {copy.title}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{copy.body}</p>
          <p className="mt-2 rounded-md bg-white/75 px-3 py-1.5 text-xs font-black leading-5 text-slate-700">최근 상태: {registrationStatus.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-white text-slate-600 ring-1 ring-inset ring-slate-200">{rows.toLocaleString()}행 대기</Badge>
          <Link
            className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-black shadow-sm ${
              primaryAction.tone === "solid"
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
            href={primaryAction.href}
          >
            {primaryAction.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

function MappingPresetCard({
  canLoad,
  canSave,
  message,
  templateLabel,
  onLoad,
  onRemove,
  onSave
}: {
  canLoad: boolean;
  canSave: boolean;
  message: string;
  templateLabel: string;
  onLoad: () => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mb-4 rounded-md border border-indigo-100 bg-indigo-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">ERP 매핑 프리셋</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            {message || `${templateLabel}의 현재 컬럼 연결을 저장해 다음 업로드에 재사용합니다.`}
          </p>
        </div>
        {canLoad ? <Badge className="shrink-0 bg-indigo-100 text-indigo-700">저장됨</Badge> : <Badge className="shrink-0 bg-white text-slate-500">없음</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" className="bg-white" onClick={onSave} disabled={!canSave}>
          저장
        </Button>
        <Button size="sm" variant="outline" className="bg-white" onClick={onLoad} disabled={!canLoad}>
          불러오기
        </Button>
        <Button size="sm" variant="outline" className="bg-white text-slate-500" onClick={onRemove} disabled={!canLoad}>
          삭제
        </Button>
      </div>
    </div>
  );
}

function RecentUploadHistoryCard({ uploads }: { uploads: UploadHistoryRow[] }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(10);
  const completedCount = uploads.filter((upload) => upload.status === "completed").length;
  const failedCount = uploads.filter((upload) => upload.status === "failed").length;
  const averageQuality = uploads.length ? Math.round(uploads.reduce((sum, upload) => sum + upload.qualityScore, 0) / uploads.length) : 0;
  const totalPages = Math.max(1, Math.ceil(uploads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const latestUploads = uploads.slice(start, start + pageSize);
  const pageStart = uploads.length ? start + 1 : 0;
  const pageEnd = Math.min(uploads.length, start + pageSize);

  return (
    <div className="maju-section-card mb-4 overflow-hidden">
      <div className="maju-card-header flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <History className="h-4 w-4 text-slate-500" />
            최근 등록 이력
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">저장된 업로드 결과와 품질, 중복 후보를 확인합니다.</p>
        </div>
        <div className="grid gap-2 text-xs lg:min-w-[520px] lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <MiniStatus label="완료" value={`${completedCount.toLocaleString()}건`} />
          <MiniStatus label="실패" value={`${failedCount.toLocaleString()}건`} />
          <MiniStatus label="평균 품질" value={uploads.length ? `${averageQuality}%` : "-"} />
          {uploads.length ? (
            <div className="flex flex-wrap items-center gap-1 rounded-md bg-white px-2 py-2">
              <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
                보기
                <select
                  className="h-6 border-0 bg-transparent p-0 text-xs font-black text-slate-900 outline-none focus:ring-0"
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as ListPageSize);
                    setPage(1);
                  }}
                  value={pageSize}
                >
                  {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}개
                    </option>
                  ))}
                </select>
              </label>
              <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-black text-slate-500">
                {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {uploads.length.toLocaleString()}
              </span>
              <button
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                이전
              </button>
              <button
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                type="button"
              >
                다음
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {latestUploads.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="w-[34%] border-r border-slate-200 px-4 py-3 font-black">파일명</th>
                <th className="w-[116px] border-r border-slate-200 px-3 py-3 font-black">상태</th>
                <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-right font-black">행</th>
                <th className="w-[100px] border-r border-slate-200 px-3 py-3 text-right font-black">중복</th>
                <th className="w-[120px] border-r border-slate-200 px-3 py-3 text-right font-black">건강도</th>
                <th className="w-[150px] border-r border-slate-200 px-3 py-3 font-black">품질</th>
                <th className="w-[130px] px-3 py-3 font-black">리포트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {latestUploads.map((upload) => (
                <tr key={upload.id} className="align-middle hover:bg-slate-50/80">
                  <td className="min-w-0 border-r border-slate-100 px-4 py-3">
                    <p className="truncate font-black text-slate-900">{upload.filename}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      {upload.createdAt}
                    </p>
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3">
                    <Badge className={upload.status === "completed" ? "bg-emerald-100 text-emerald-800" : upload.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                      {upload.status === "completed" ? "완료" : upload.status === "failed" ? "실패" : "진행중"}
                    </Badge>
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3 text-right font-black text-slate-900">{upload.rows.toLocaleString()}개</td>
                  <td className="border-r border-slate-100 px-3 py-3 text-right font-black text-slate-700">{upload.duplicateCount.toLocaleString()}개</td>
                  <td className="border-r border-slate-100 px-3 py-3 text-right font-black text-slate-900">{upload.healthScore}점</td>
                  <td className="border-r border-slate-100 px-3 py-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-500">
                      <span>품질</span>
                      <span>{upload.qualityScore}%</span>
                    </div>
                    <Progress className="mt-1.5 h-1.5" value={upload.qualityScore} />
                  </td>
                  <td className="px-3 py-3">
                    <Link className="maju-button-secondary inline-flex h-8 w-full items-center justify-center gap-1 px-2 text-xs" href={`/reports/${upload.reportId}`}>
                      확인
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <div className="maju-empty-state p-4 text-center">
            <p className="text-sm font-black text-slate-900">아직 등록 이력이 없습니다.</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">엑셀 업로드 후 저장하면 파일명, 품질, 중복 후보, 리포트 링크가 이곳에 표시됩니다.</p>
          </div>
        </div>
      )}
      {uploads.length ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <Link className="inline-flex items-center gap-1 text-xs font-black text-slate-700 hover:text-slate-950" href="/admin/uploads">
            관리자 업로드 이력 전체 보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DataPreview({ fields, fieldMap, rows }: { fields: readonly UploadTemplateField[]; fieldMap: FieldMap; rows: RawRow[] }) {
  const previewFields = fields.filter((field) => field.required || fieldMap[field.key]).slice(0, 5);
  const previewRows = rows.slice(0, 3);

  return (
    <div className="maju-section-card mt-3 overflow-hidden">
      <div className="maju-card-header flex items-center justify-between px-3 py-2">
        <p className="text-xs font-black text-slate-500">미리보기</p>
        <p className="text-xs font-bold text-slate-400">상위 {previewRows.length}행</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {previewFields.map((field) => (
                <th key={field.key} className="whitespace-nowrap px-3 py-2 font-black">
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100">
                {previewFields.map((field) => (
                  <td key={field.key} className="max-w-32 truncate px-3 py-2 font-bold text-slate-700">
                    {String(row[fieldMap[field.key] || field.key] ?? "-") || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineStatusPanel({ steps, meta }: { steps: PipelineStep[]; meta: { rows: number; qualityScore: number; persisted: boolean } }) {
  const done = steps.filter((step) => step.status === "done").length;
  const progress = Math.round((done / steps.length) * 100);

  return (
    <div className="maju-section-card overflow-hidden">
      <div className="maju-card-header px-4 py-3">
        <div className="flex items-center gap-3 text-lg font-black">
          <Activity className="h-6 w-6 animate-pulse text-primary" />
          데이터 적재 파이프라인 실행 중
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          원본 데이터부터 정제 데이터, 회사 건강도, 추천 액션까지 리포트 재생성이 가능하도록 처리합니다.
        </p>
      </div>
      <div className="p-4">
      <Progress value={progress} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <PipelineMetric icon={FileSpreadsheet} label="처리 rows" value={`${meta.rows}개`} />
        <PipelineMetric icon={Database} label="저장 상태" value={meta.persisted ? "저장 완료" : "저장 확인 필요"} />
        <PipelineMetric icon={Save} label="품질 점수" value={meta.qualityScore ? `${meta.qualityScore}%` : "계산 중"} />
      </div>
      </div>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {steps.map((step) => (
          <div key={step.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[28px_1fr_auto] sm:items-center">
            <span
              className={
                step.status === "done"
                  ? "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"
                  : step.status === "running"
                    ? "flex h-7 w-7 items-center justify-center rounded-full bg-accent text-foreground"
                    : step.status === "error"
                      ? "flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                    : "flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
              }
            >
              {step.status === "done" ? <Check className="h-4 w-4" /> : step.status === "running" ? <Activity className="h-4 w-4 animate-pulse" /> : step.status === "error" ? <AlertTriangle className="h-4 w-4" /> : null}
            </span>
            <div>
              <p className="font-black">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            <Badge className={step.status === "done" ? "bg-primary/10 text-primary" : step.status === "running" ? "bg-accent/20 text-foreground" : step.status === "error" ? "bg-rose-100 text-rose-800" : ""}>
              {step.status === "done" ? "완료" : step.status === "running" ? "진행 중" : step.status === "error" ? "실패" : "대기"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineMetric({ icon: Icon, label, value }: { icon: typeof FileSpreadsheet; label: string; value: string }) {
  return (
    <div className="maju-stat-card bg-muted/35 p-3">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function BigNumber({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl font-black text-primary">{value}</p>
    </div>
  );
}

function mapMasterRowsToCustomers(rows: RawRow[], fieldMap: FieldMap): CustomerRow[] {
  return rows.map((row) => ({
    companyName: "마주식자재",
    customerName: getCell(row, fieldMap.customerName),
    region: getCell(row, fieldMap.region) || extractRegion(getCell(row, fieldMap.address)),
    address: getCell(row, fieldMap.address),
    industry: getCell(row, fieldMap.industry) || "미분류",
    monthlyRevenue: 0,
    lastOrderDays: 0,
    visitCount: 0,
    deliveryKm: toNumber(row[fieldMap.deliveryKm || ""])
  }));
}

function mapSalesRowsToCustomers(rows: RawRow[], fieldMap: FieldMap): CustomerRow[] {
  const grouped = new Map<
    string,
    {
      address: string;
      amount: number;
      industry: string;
      lastDate: Date | null;
      name: string;
      region: string;
      visits: number;
    }
  >();

  rows.forEach((row) => {
    const customerName = getCell(row, fieldMap.customerName);
    if (!customerName) return;
    const businessRegistrationNumber = getCell(row, fieldMap.businessRegistrationNumber).replace(/[^0-9]/g, "");
    const customerKey = businessRegistrationNumber || customerName;

    const current = grouped.get(customerKey) || {
      address: getCell(row, fieldMap.address),
      amount: 0,
      industry: getCell(row, fieldMap.productName) || "미분류",
      lastDate: null,
      name: customerName,
      region: getCell(row, fieldMap.region) || extractRegion(getCell(row, fieldMap.address)),
      visits: 0
    };
    const nextDate = parseExcelDate(row[fieldMap.salesDate || ""]);

    current.amount += toNumber(row[fieldMap.salesAmount || ""]);
    current.visits += 1;
    if (nextDate && (!current.lastDate || nextDate > current.lastDate)) current.lastDate = nextDate;
    if (!current.address) current.address = getCell(row, fieldMap.address);
    if (!current.region) current.region = getCell(row, fieldMap.region) || extractRegion(current.address);
    grouped.set(customerKey, current);
  });

  return Array.from(grouped.values()).map((row) => ({
    companyName: "마주식자재",
    customerName: row.name,
    region: row.region || "미분류",
    address: row.address,
    industry: row.industry,
    monthlyRevenue: Math.round(row.amount),
    lastOrderDays: row.lastDate ? daysSince(row.lastDate) : 0,
    visitCount: row.visits,
    deliveryKm: 0
  }));
}

function autoMapHeaders(headers: string[], fields: readonly UploadTemplateField[]): FieldMap {
  return fields.reduce<FieldMap>((map, field) => {
    const matched = headers.find((header) => {
      const normalized = header.toLowerCase().replace(/\s/g, "");
      return field.aliases.some((alias) => normalized.includes(alias.toLowerCase().replace(/\s/g, "")));
    });
    if (matched) map[field.key] = matched;
    return map;
  }, {});
}

function createIdentityFieldMap(fields: readonly UploadTemplateField[]): FieldMap {
  return fields.reduce<FieldMap>((map, field) => {
    map[field.key] = field.key;
    return map;
  }, {});
}

async function parseUploadRows(file: File): Promise<RawRow[]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return rowsToRawRows(parseCsvRows(await file.text()));
  }

  // Loaded on demand instead of at the top of the file: this Excel-parsing library is only ever
  // needed once a user actually uploads a file, so keeping it out of the static import graph
  // keeps it out of the initial JS bundle for this (very large) page.
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file, 1);
  return rowsToRawRows(rows);
}

function parseCsvRows(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows;
}

function rowsToRawRows(rows: unknown[][]): RawRow[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((cell) => String(cell ?? "").trim());
  return rows
    .slice(headerIndex + 1)
    .map((row) =>
      headers.reduce<RawRow>((rawRow, header, index) => {
        if (!header) return rawRow;
        rawRow[header] = normalizeUploadCell(row[index]);
        return rawRow;
      }, {})
    )
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function normalizeUploadCell(value: unknown): RawRow[string] {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value == null) return "";
  return String(value);
}

async function downloadWorkbook(filename: string, sheets: { name: string; rows: RawRow[] }[]) {
  // Same reasoning as parseUploadRows: only load the Excel-writing library once the user
  // actually clicks a download button, not on every visit to this page.
  const writeXlsxFileModule = await import("write-excel-file/browser");
  const workbookSheets = sheets.map((sheet) => ({
    data: rawRowsToSheetData(sheet.rows),
    sheet: sheet.name.slice(0, 31)
  }));

  await writeXlsxFileModule.default(workbookSheets).toFile(filename);
}

function rawRowsToSheetData(rows: RawRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.map((header) => ({ fontWeight: "bold", value: header })),
    ...rows.map((row) => headers.map((header) => ({ value: normalizeWorkbookCell(row[header]) })))
  ];
}

function normalizeWorkbookCell(value: RawRow[string]) {
  if (value == null) return "";
  return value;
}

function buildTemplateWorkbookRows(type: UploadTemplateType) {
  const fields = uploadTemplates[type].fields;
  const dataRow = fields.reduce<RawRow>((row, field) => {
    row[field.label] = templateSampleValue(field.key);
    return row;
  }, {});
  const guideRows = fields.map((field) => ({
    컬럼명: field.label,
    필수여부: field.required ? "필수" : "선택",
    시스템키: field.key,
    인식가능헤더: field.aliases.join(", "),
    설명: field.description || ""
  }));

  return { dataRows: [dataRow], guideRows };
}

// 2026-08-26 "전체 운영중에 가짜 데이터들 있는 지 확인하고 없애" 조치: 사업자등록번호·대표자명·개업일·
// 연락처·이메일을 인덱스 기반으로 그럴듯하게 지어내던 로직을 제거했습니다. customers(고객사 미리보기)는
// mapMasterRowsToCustomers(rawRows, fieldMap)에서 rawRows와 1:1 순서로 생성되므로, 같은 인덱스의
// rawRows[index]에서 getCell로 실제 원본 값을 꺼내 씁니다. 원본 업로드에 해당 컬럼이 없거나 매핑이 안 돼
// 있으면(예: 매출분석 업로드처럼애초에 그 필드가 없는 템플릿) 가짜 값 대신 빈 칸으로 둡니다.
function buildCustomerExportRows(customers: CustomerRow[], rawRows: RawRow[], fieldMap: FieldMap): RawRow[] {
  const rowsAligned = rawRows.length === customers.length;

  return customers.map((customer, index) => {
    const raw = rowsAligned ? rawRows[index] : undefined;

    return {
      회사명: customer.companyName,
      "거래처/매장 상호명": customer.customerName,
      사업자등록번호: raw ? getCell(raw, fieldMap.businessRegistrationNumber) : "",
      대표자명: raw ? getCell(raw, fieldMap.representativeName) : "",
      개업일: raw ? getCell(raw, fieldMap.openingDate) : "",
      배송주소: customer.address,
      지역: customer.region,
      업종: customer.industry,
      매출등급: revenueGrade(customer.monthlyRevenue),
      월매출: customer.monthlyRevenue,
      최근주문일수: customer.lastOrderDays,
      월방문횟수: customer.visitCount,
      "기존 계산거리(km)": customer.deliveryKm,
      연락처: raw ? getCell(raw, fieldMap.phone) : "",
      이메일: raw ? getCell(raw, fieldMap.email) : "",
      "네이버 플레이스 링크": customer.naverPlaceUrl || "",
      "카카오맵 링크": customer.kakaoPlaceUrl || "",
      "구글맵 링크": customer.googleMapUrl || ""
    };
  });
}

// 2026-08-26 조치: 실제 업로드된 매출 데이터(uploadedRows)가 없을 때, 매출일자·품목명·수량·사업자등록번호를
// 지어내 "매출 거래내역"인 것처럼 내보내던 로직을 제거했습니다. 실제 매출 데이터가 없으면 빈 시트를
// 내보냅니다(가짜 거래 내역을 진짜처럼 다운로드하지 않음).
function buildSalesExportRows(uploadedRows: RawRow[]): RawRow[] {
  return uploadedRows;
}

function templateSampleValue(key: string) {
  const samples: RawRow = {
    customerName: "성동 마루한식 01",
    businessRegistrationNumber: "123-45-67890",
    representativeName: "김민준",
    openingDate: "2016-02-02",
    address: "서울 성동구 왕십리로 63",
    deliveryKm: 7.4,
    phone: "010-3100-1000",
    email: "store@maju-demo.kr",
    birthDate: "1974-01-01",
    region: "성동구",
    industry: "한식",
    // 실제 다른 업체의 링크가 아니라 예시 매장명(성동 마루한식 01)과 형식만 맞춘 안내용 링크입니다.
    naverPlaceUrl: "https://map.naver.com/p/search/성동 마루한식 01",
    kakaoPlaceUrl: "https://map.kakao.com/?q=성동 마루한식 01",
    googleMapUrl: "https://www.google.com/maps/search/성동 마루한식 01",
    salesDate: "2026-07-01",
    salesAmount: 2340000,
    productName: "육류",
    quantity: 12
  };

  return samples[key] ?? "";
}

function revenueGrade(monthlyRevenue: number) {
  if (monthlyRevenue >= 350) return "A등급";
  if (monthlyRevenue >= 180) return "B등급";
  return "C등급";
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function getOcrProviderLabel(provider?: string) {
  if (provider === "naver-clova") return "Naver CLOVA";
  if (provider === "upstage") return "Upstage";
  if (provider === "openai-vision") return "OpenAI Vision";
  if (provider === "sample" || provider === "assistive-check") return "OCR 보조 검증";
  return "대기";
}

function fieldLabelForHeader(header: string, fields: readonly UploadTemplateField[]) {
  return fields.find((field) => field.key === header)?.label || header;
}

function summarizeDataQuality(
  rows: RawRow[],
  requiredFields: readonly UploadTemplateField[],
  fieldMap: FieldMap,
  exemptBusinessNumbers: Set<string> = new Set()
): DataQualitySummary {
  const seenKeys = new Map<string, number>();
  let duplicateCandidates = 0;
  const invalidBusinessNumbers: DataQualitySummary["invalidBusinessNumbers"] = [];
  const issueRows: DataQualitySummary["issueRows"] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const missingLabels = requiredFields
      .filter((field) => {
        const sourceHeader = fieldMap[field.key];
        return !sourceHeader || !String(row[sourceHeader] ?? "").trim();
      })
      .map((field) => field.label);

    if (missingLabels.length) {
      issueRows.push({ missingLabels, rowNumber });
    }

    const rawBusinessNumber = getCell(row, fieldMap.businessRegistrationNumber);
    const businessNumber = normalizeTextForCompare(rawBusinessNumber);
    if (rawBusinessNumber && !isValidBusinessRegistrationNumber(rawBusinessNumber)) {
      invalidBusinessNumbers.push({ rowNumber, value: rawBusinessNumber });
    }

    const customerName = normalizeTextForCompare(getCell(row, fieldMap.customerName));
    const address = normalizeTextForCompare(getCell(row, fieldMap.address));
    // 중복 허용 목록에 등록된 사업자번호(종사업자번호 등)는 상호명+주소 기준으로 구분합니다.
    const keyEligibleBusinessNumber = businessNumber && !exemptBusinessNumbers.has(businessNumber) ? businessNumber : "";
    const duplicateKey = keyEligibleBusinessNumber || [customerName, address].filter(Boolean).join("|");

    if (duplicateKey) {
      const count = seenKeys.get(duplicateKey) || 0;
      if (count > 0) duplicateCandidates += 1;
      seenKeys.set(duplicateKey, count + 1);
    }
  });

  const blockingRows = new Set([...issueRows.map((issue) => issue.rowNumber), ...invalidBusinessNumbers.map((issue) => issue.rowNumber)]);

  return {
    duplicateCandidates,
    invalidBusinessNumbers,
    issueRows,
    readyRows: Math.max(0, rows.length - blockingRows.size),
    rows: rows.length
  };
}

function buildIssueRows(rows: RawRow[], summary: DataQualitySummary, fieldMap: FieldMap): RawRow[] {
  const issueMap = new Map(summary.issueRows.map((issue) => [issue.rowNumber, issue.missingLabels]));
  const invalidBusinessNumberMap = new Map(summary.invalidBusinessNumbers.map((issue) => [issue.rowNumber, issue.value]));

  return rows.reduce<RawRow[]>((issueRows, row, index) => {
    const rowNumber = index + 2;
    const missingLabels = issueMap.get(rowNumber);
    const invalidBusinessNumber = invalidBusinessNumberMap.get(rowNumber);
    if (!missingLabels && !invalidBusinessNumber) return issueRows;

    issueRows.push({
        보완필요행: rowNumber,
        누락필수값: missingLabels?.join(", ") || "",
        사업자번호오류: invalidBusinessNumber ? "유효하지 않은 사업자등록번호" : "",
        거래처명: getCell(row, fieldMap.customerName),
        사업자등록번호: getCell(row, fieldMap.businessRegistrationNumber),
        주소: getCell(row, fieldMap.address),
        ...row
    });

    return issueRows;
  }, []);
}

function mappingPresetEndpoint(type: UploadTemplateType) {
  const params = new URLSearchParams({ uploadType: type });
  const companyId = getAdminCompanyIdFromUrl();
  if (companyId) params.set("companyId", companyId);
  return `/api/excel-mapping-presets?${params.toString()}`;
}

function businessNumberExceptionsEndpoint() {
  const companyId = getAdminCompanyIdFromUrl();
  return companyId ? `/api/business-number-exceptions?companyId=${encodeURIComponent(companyId)}` : "/api/business-number-exceptions";
}

function isUploadTemplateType(value: string | null): value is UploadTemplateType {
  return value === "customer-master" || value === "sales-analysis";
}

function uploadHistoryEndpoint() {
  const companyId = getAdminCompanyIdFromUrl();
  return companyId ? `/api/upload-history?companyId=${encodeURIComponent(companyId)}` : "/api/upload-history";
}

function customerMasterEndpoint() {
  const companyId = getAdminCompanyIdFromUrl();
  return companyId ? `/api/customers?companyId=${encodeURIComponent(companyId)}` : "/api/customers";
}

function customerHistoryHref(customerId: string) {
  const params = new URLSearchParams();
  const companyId = getAdminCompanyIdFromUrl();
  if (companyId) params.set("companyId", companyId);
  if (customerId) params.set("customerId", customerId);
  const query = params.toString();
  return query ? `/crm/timeline?${query}` : "/crm/timeline";
}

function buildPlaceSearchLinks(customerName: string, address?: string) {
  const fullQuery = [customerName, address].map((value) => value?.trim()).filter(Boolean).join(" ") || "거래처";
  const encodedFullQuery = encodeURIComponent(fullQuery);
  // 네이버 지도는 상호명+상세주소로 검색하면 네이버 DB 주소 표기와 조금만 달라도 결과가 없거나 다른
  // 곳으로 연결되는 경우가 많아, 상호명 단독 검색이 훨씬 안정적으로 매칭됩니다.
  const encodedNaverQuery = encodeURIComponent(customerName?.trim() || fullQuery);
  return [
    { href: `https://map.naver.com/p/search/${encodedNaverQuery}`, label: "네이버" },
    { href: `https://map.kakao.com/?q=${encodedFullQuery}`, label: "카카오맵" },
    { href: `https://www.google.com/maps/search/${encodedFullQuery}`, label: "구글맵" }
  ];
}

function buildManualCustomerPayload(row: RawRow) {
  return {
    address: String(row.address || ""),
    birthDate: String(row.birthDate || ""),
    businessNumber: String(row.businessRegistrationNumber || ""),
    businessStatus: "확인 필요",
    customerName: String(row.customerName || ""),
    deliveryKm: toNumber(row.deliveryKm),
    email: String(row.email || ""),
    industry: String(row.industry || "미분류"),
    kakaoPlaceUrl: String(row.kakaoPlaceUrl || ""),
    lastOrderDays: 0,
    monthlyRevenue: 0,
    googleMapUrl: String(row.googleMapUrl || ""),
    naverPlaceUrl: String(row.naverPlaceUrl || ""),
    openingDate: String(row.openingDate || ""),
    phone: String(row.phone || ""),
    region: String(row.region || extractRegion(String(row.address || "")) || "미분류"),
    representativeName: String(row.representativeName || ""),
    // 사업자번호를 모르는 채로 거래처를 우선 등록해야 하는 경우가 많아, 이 수기 등록 흐름도 다른
    // 거래처 등록 경로(지도 작업공간, CRM 원장)와 마찬가지로 저장을 막지 않습니다(회사 자체 가입
    // 화면의 엄격한 검증과는 별개 기준).
    validateBusinessNumber: false,
    visitCount: 0
  };
}

function loadMappingPreset(type: UploadTemplateType) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(mappingPresetStorageKey);
    if (!raw) return null;
    const presets = JSON.parse(raw) as Partial<Record<UploadTemplateType, FieldMap>>;
    return presets[type] || null;
  } catch {
    return null;
  }
}

function saveMappingPreset(type: UploadTemplateType, fieldMap: FieldMap) {
  if (typeof window === "undefined") return;
  const presets = readMappingPresets();
  presets[type] = fieldMap;
  window.localStorage.setItem(mappingPresetStorageKey, JSON.stringify(presets));
}

function deleteMappingPreset(type: UploadTemplateType) {
  if (typeof window === "undefined") return;
  const presets = readMappingPresets();
  delete presets[type];
  window.localStorage.setItem(mappingPresetStorageKey, JSON.stringify(presets));
}

function readMappingPresets() {
  try {
    const raw = window.localStorage.getItem(mappingPresetStorageKey);
    return raw ? (JSON.parse(raw) as Partial<Record<UploadTemplateType, FieldMap>>) : {};
  } catch {
    return {};
  }
}

function manualInputType(key: string) {
  if (key.toLowerCase().includes("date")) return "date";
  if (["salesAmount", "quantity", "deliveryKm"].includes(key)) return "number";
  return "text";
}

function manualInputMode(key: string) {
  if (["salesAmount", "quantity", "deliveryKm"].includes(key)) return "decimal";
  if (key.toLowerCase().includes("phone") || key.toLowerCase().includes("number")) return "numeric";
  return "text";
}

function getCell(row: RawRow, key?: string) {
  return key ? String(row[key] || "").trim() : "";
}

function normalizeTextForCompare(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 입력 중에도 자동으로 하이픈이 붙도록 하는 실시간 포맷터입니다 (10자리 미만이어도 동작).
function formatBusinessNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 휴대폰(010 등, 3-4-4)과 서울(02)/지역 번호를 입력 자릿수에 맞춰 실시간으로 하이픈 처리합니다.
function formatPhoneNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseExcelDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch;
  }
  const date = new Date(String(value).replace(/\./g, "-").replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(date: Date) {
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function extractRegion(address: string) {
  const tokens = address.split(/\s+/).filter(Boolean);
  return tokens.find((token) => token.endsWith("구") || token.endsWith("동") || token.endsWith("시")) || tokens[1] || "미분류";
}

function resetPipelineSteps() {
  return initialPipelineSteps.map((step) => ({ ...step, status: "pending" as PipelineStatus }));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
