"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  HeartPulse,
  History,
  MapPin,
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
import { ExcelHeaderMappingPreview } from "@/components/excel-mapping-preview";
import { Progress } from "@/components/ui/progress";
import { analyzeCompany, AnalysisResult } from "@/lib/analysis";
import { CustomerRow, sampleCustomers, UploadTemplateField, UploadTemplateType, uploadTemplates } from "@/lib/sample-data";

type RawRow = Record<string, string | number | boolean | null | undefined>;
type FieldMap = Record<string, string>;
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
type AddressSearchResult = {
  address: string;
  buildingName: string;
  jibunAddress: string;
  latitude: number;
  longitude: number;
  postalCode: string;
  region: string;
  roadAddress: string;
};

const emptyMap: FieldMap = {};
const mappingPresetStorageKey = "maju:data-registration:mapping-presets";
const initialPipelineSteps: PipelineStep[] = [
  { key: "file", label: "파일 수신", description: "엑셀 파일과 시트 정보를 확인합니다.", status: "pending" },
  { key: "mapping", label: "컬럼 매핑", description: "필수 컬럼과 업로드 컬럼을 연결합니다.", status: "pending" },
  { key: "raw", label: "Raw 데이터 적재", description: "원본 행 데이터를 재분석 가능하게 보존합니다.", status: "pending" },
  { key: "normalize", label: "거래처 정제", description: "거래처명, 주소, 업종, 매출 정보를 표준화합니다.", status: "pending" },
  { key: "score", label: "Health Score 계산", description: "영업력, 배송효율, 리스크 점수를 계산합니다.", status: "pending" },
  { key: "report", label: "AI 리포트 생성", description: "대표가 볼 진단 리포트와 추천 리드를 생성합니다.", status: "pending" }
];
const initialRegistrationStatus: RegistrationStatus = {
  actionLabel: "대기 중",
  description: "엑셀 업로드 또는 수기 입력을 시작하면 이곳에서 저장 가능 여부와 서버 반영 결과를 확인합니다.",
  nextAction: "거래처 마스터 또는 매출 거래내역 등록 방식을 선택하세요.",
  status: "idle",
  title: "아직 등록이 시작되지 않았습니다."
};

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
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
  const [usingSample, setUsingSample] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>(sampleCustomers);
  const [uploadedFilename, setUploadedFilename] = useState<string>("registered-customers");
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryRow[]>([]);
  const [lastManualCustomerHref, setLastManualCustomerHref] = useState("");
  const [manualSaveMessage, setManualSaveMessage] = useState("");
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(initialPipelineSteps);
  const [pipelineMeta, setPipelineMeta] = useState({ rows: sampleCustomers.length, qualityScore: 100, persisted: false });
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>(initialRegistrationStatus);

  const analysis = useMemo(() => analyzeCompany(customers), [customers]);
  const currentTemplate = uploadTemplates[uploadType];

  useEffect(() => {
    refreshUploadHistory();
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
      { name: "거래처 마스터", rows: buildCustomerExportRows(customers) }
    ]);
  }

  function downloadSalesExport() {
    downloadWorkbook(`maju_매출_거래내역_내보내기_${dateStamp()}.xlsx`, [
      { name: "매출 거래내역", rows: buildSalesExportRows(customers, uploadType === "sales-analysis" ? rawRows : []) }
    ]);
  }

  function startUploadFlow(nextType: UploadTemplateType) {
    setUploadType(nextType);
    setFieldMap(autoMapHeaders(headers, uploadTemplates[nextType].fields));
    setScreen("onboarding");
  }

  function generateCurrentReport() {
    setUsingSample(false);
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
      setUsingSample(false);
      setRegistrationStatus({
        actionLabel: "파일 수신 완료",
        description: `${json.length.toLocaleString()}개 행과 ${nextHeaders.length.toLocaleString()}개 컬럼을 확인했습니다. 필수 매핑 ${mappedCount}/${requiredCount}개가 자동 연결됐습니다.`,
        nextAction: mappedCount === requiredCount ? "우측에서 품질을 확인한 뒤 업데이트 후 리포트 갱신을 누르세요." : "우측 컬럼 매핑에서 필수 컬럼을 연결하세요.",
        status: mappedCount === requiredCount ? "ready" : "warning",
        title: mappedCount === requiredCount ? "저장 준비가 거의 완료됐습니다." : "필수 컬럼 매핑이 더 필요합니다."
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

  async function saveManualEntry() {
    if (uploadType === "customer-master" && !isValidBusinessRegistrationNumber(String(manualDraft.businessRegistrationNumber ?? ""))) return;

    setIsManualSaving(true);
    setLastManualCustomerHref("");
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
    setUsingSample(false);
    setManualSaveMessage("저장 대기 목록에 추가했습니다.");
    setRegistrationStatus({
      actionLabel: "수기 등록 저장 중",
      description: `${String(nextRow.customerName || nextRow.name || "신규 거래처")} 정보를 저장 대기 목록에 추가하고 서버 반영을 확인하고 있습니다.`,
      nextAction: "저장 결과를 확인 중입니다.",
      status: "running",
      title: "수기 입력값을 처리하고 있습니다."
    });

    try {
      if (uploadType === "customer-master") {
        const response = await fetch(customerMasterEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildManualCustomerPayload(nextRow))
        }).catch(() => null);
        const payload = response ? await response.json().catch(() => null) : null;

        if (response?.ok) {
          const customerId = String(payload?.customer?.id || "");
          setLastManualCustomerHref(customerId ? customerHistoryHref(customerId) : "/crm/timeline");
          setManualSaveMessage(payload?.persisted === false ? "저장 대기 목록에 추가했습니다. 서버 저장 상태는 관리자 시스템 점검에서 확인하세요." : "서버에 저장했습니다. 거래처 히스토리에서 바로 확인할 수 있습니다.");
          setRegistrationStatus({
            actionLabel: payload?.persisted === false ? "로컬 대기" : "서버 저장 완료",
            description: payload?.persisted === false ? "입력값은 화면에 반영됐지만 서버 저장 여부는 추가 확인이 필요합니다." : "거래처 원장에 저장됐고 히스토리 화면에서 확인할 수 있습니다.",
            nextAction: customerId ? "히스토리에서 확인하거나 추가 거래처를 계속 등록하세요." : "거래처 히스토리 화면에서 저장 결과를 확인하세요.",
            status: payload?.persisted === false ? "warning" : "success",
            title: payload?.persisted === false ? "저장 확인이 필요합니다." : "수기 등록이 완료됐습니다."
          });
          await refreshUploadHistory();
        } else if (response?.status === 401) {
          setManualSaveMessage("저장 대기 목록에 추가했습니다. 서버 저장은 고객사 또는 관리자 로그인 후 가능합니다.");
          setRegistrationStatus({
            actionLabel: "로그인 필요",
            description: "화면의 저장 대기 목록에는 추가됐지만, 서버 저장 API가 로그인을 요구했습니다.",
            nextAction: "고객사 또는 관리자 계정으로 로그인한 뒤 다시 저장하세요.",
            status: "warning",
            title: "서버 저장은 아직 완료되지 않았습니다."
          });
        } else {
          setManualSaveMessage(payload?.message ? `저장 대기 목록에 추가했습니다. 서버 저장 확인: ${payload.message}` : "저장 대기 목록에 추가했습니다. 서버 저장은 나중에 다시 시도하세요.");
          setRegistrationStatus({
            actionLabel: "서버 저장 확인 필요",
            description: payload?.message || "서버가 저장 완료 응답을 주지 않았습니다.",
            nextAction: "입력값을 확인한 뒤 다시 저장하거나 관리자 시스템 상태를 확인하세요.",
            status: "warning",
            title: "저장 대기 상태입니다."
          });
        }
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
      description: `${rawRows.length.toLocaleString()}개 원본 행을 정제하고 서버 저장을 시도합니다.`,
      nextAction: "파이프라인 단계가 모두 완료될 때까지 기다려 주세요.",
      status: "running",
      title: "데이터 업데이트를 시작했습니다."
    });
    const mapped = uploadType === "sales-analysis" ? mapSalesRowsToCustomers(rawRows, fieldMap) : mapMasterRowsToCustomers(rawRows, fieldMap);

    const nextRows = mapped.length ? mapped : customers;
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
      setRegistrationStatus({
        actionLabel: persisted ? "서버 저장 완료" : "분석 완료 · 저장 확인 필요",
        description: persisted ? `${nextFilename} 데이터가 서버에 저장되고 AI 리포트가 갱신됐습니다.` : "분석은 완료됐지만 서버 저장이 확인되지 않았습니다.",
        nextAction: persisted ? "AI 리포트와 거래처 히스토리, 매출 원장에서 반영 결과를 확인하세요." : "로그인/DB 환경변수를 확인한 뒤 다시 저장을 시도하세요.",
        status: persisted ? "success" : "warning",
        title: persisted ? "데이터 등록이 완료됐습니다." : "분석은 됐지만 서버 저장 확인이 필요합니다."
      });
      await completePipelineStep("report");
    } else {
      const payload = response ? await response.json().catch(() => null) : null;
      setPipelineMeta({ rows: nextRows.length, qualityScore: 0, persisted: false });
      setPipelineSteps((steps) => steps.map((step) => (step.key === "report" ? { ...step, status: "error" } : step)));
      setRegistrationStatus({
        actionLabel: response?.status === 401 ? "로그인 필요" : "저장 실패",
        description: payload?.message || payload?.error || "서버 저장 API가 완료 응답을 주지 않았습니다.",
        nextAction: response?.status === 401 ? "고객사 또는 관리자 계정으로 로그인한 뒤 다시 리포트를 갱신하세요." : "관리자 시스템 상태와 DB 연결을 확인하세요.",
        status: response?.status === 401 ? "warning" : "error",
        title: "데이터 등록이 서버에 반영되지 않았습니다."
      });
    }

    await refreshUploadHistory();
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setScreen("report");
    }, 450);
  }

  async function refreshUploadHistory() {
    const response = await fetch(uploadHistoryEndpoint(), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.uploads)) setUploadHistory(payload.uploads);
  }

  async function completePipelineStep(key: string) {
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "running" } : step)));
    await wait(230);
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "done" } : step)));
    await wait(120);
  }

  return (
    <CustomerAppShell
      active="data"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
          href={adminCompanyId ? `/routes/today?companyId=${encodeURIComponent(adminCompanyId)}` : "/routes/today"}
        >
          영업·배송 코스
        </Link>
      }
      subtitle="거래처 마스터와 매출 거래내역을 등록하고, 업로드 양식과 현재 데이터를 내려받습니다."
      title="데이터 등록"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <div className="mx-auto max-w-[1880px] space-y-4">
        <WorkspaceModeTabs active={screen} onMove={setScreen} />
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
            usingSample={usingSample}
            isManualSaving={isManualSaving}
            lastManualCustomerHref={lastManualCustomerHref}
            manualSaveMessage={manualSaveMessage}
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
        {screen === "report" && <Report analysis={analysis} meta={pipelineMeta} onReset={() => setScreen("onboarding")} uploadType={uploadType} />}
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

function WorkspaceModeTabs({ active, onMove }: { active: string; onMove: (screen: "briefing" | "onboarding" | "report") => void }) {
  const tabs = [
    ["briefing", "등록 가이드"],
    ["onboarding", "데이터 등록"],
    ["report", "AI 리포트"]
  ] as const;
  const copy = {
    briefing: ["데이터 등록 전 확인할 것", "기초정보는 1회 저장하고, 매출 거래내역은 반복 업데이트해서 회사 현황을 갱신합니다."],
    onboarding: ["매장 기본정보 · 매출 거래내역", "수기 등록, 엑셀 업로드, ERP별 컬럼 매핑을 같은 흐름에서 처리합니다."],
    report: ["AI 리포트 미리보기", "저장된 거래처와 매출 업데이트를 기준으로 대표가 볼 진단 리포트를 생성합니다."]
  }[active as "briefing" | "onboarding" | "report"] || ["매장 기본정보 · 매출 거래내역", "거래처 마스터와 매출 데이터를 운영 자산으로 관리합니다."];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-950">{copy[0]}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{copy[1]}</p>
      </div>
      <div className="grid w-full gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 sm:w-auto sm:grid-cols-3">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`min-w-[112px] rounded-lg border px-3 py-2.5 text-left transition ${
              active === key
                ? "border-blue-700 bg-blue-700 text-white shadow-[0_8px_18px_rgba(29,78,216,0.18)]"
                : "border-transparent bg-white/50 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
            }`}
            onClick={() => onMove(key)}
            type="button"
          >
            <span className="block text-sm font-black">{label}</span>
            <span className={`mt-1 block text-[11px] font-bold ${active === key ? "text-white/75" : "text-slate-400"}`}>
              {key === "briefing" ? "준비" : key === "onboarding" ? "입력" : "결과"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopNav({ active, onMove }: { active: string; onMove: (screen: "briefing" | "onboarding" | "report") => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <button className="flex items-center gap-2 text-left" onClick={() => onMove("briefing")}>
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-black text-white">M</span>
          <span>
            <span className="block text-sm font-black">MAJU Intelligence</span>
            <span className="block text-xs text-muted-foreground">AI Sales Intelligence Platform</span>
          </span>
        </button>
        <nav className="hidden items-center gap-2 md:flex">
          {[
            ["briefing", "시작"],
            ["onboarding", "데이터 등록"],
            ["report", "리포트"]
          ].map(([key, label]) => (
            <Button key={key} variant={active === key ? "default" : "ghost"} size="sm" onClick={() => onMove(key as "briefing" | "onboarding" | "report")}>
              {label}
            </Button>
          ))}
        </nav>
      </div>
    </header>
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
    ["02", "거래처 마스터 등록", "사업자번호, 대표자, 배송주소, 연락처, 적재위치 자료를 1회 저장합니다.", "기초 등록"],
    ["03", "매출 거래내역 업데이트", "ERP별 거래원장을 업로드하고 거래처 key와 매출 컬럼을 매핑합니다.", "반복 업데이트"],
    ["04", "검증 후 AI 리포트 갱신", "누락값과 사업자번호 형식을 확인한 뒤 Health Score와 추천 액션을 생성합니다.", "진단 생성"]
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
      title: "매출 거래내역서"
    }
  ] as const;
  const validationRows = [
    ["사업자번호", "10자리 형식 검증 후 저장, 추후 API로 휴폐업 상태 매일 조회"],
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
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <Badge className="mb-4 bg-blue-50 text-blue-700">등록 가이드</Badge>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">처음 등록은 어렵지 않게, 이후 업데이트는 반복 가능하게</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                엑셀 업로드는 등록 방법 중 하나입니다. 핵심은 거래처 기본정보를 회사의 기준 데이터로 저장하고, 매출 거래내역을 주기적으로 업데이트해서
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

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
              <span className="text-xs font-black text-blue-600">{step}</span>
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
              <div key={dataSet.title} className="rounded-md border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
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

        <div className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-700" />
            <p className="text-lg font-black text-slate-950">저장 전 검증 기준</p>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">ERP 양식이 달라도 아래 기준으로 정규화하면 같은 DB 구조에 저장됩니다.</p>
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

      <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-blue-950">권장 순서</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">회사 설정 확인 → 거래처 기본정보 저장 → 매출 거래내역 업로드 → AI 리포트 확인 → 히스토리와 코스에서 운영</p>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-black text-white transition hover:bg-blue-800" href="/crm/timeline">
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
  usingSample,
  isManualSaving,
  lastManualCustomerHref,
  manualSaveMessage,
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
  usingSample: boolean;
  isManualSaving: boolean;
  lastManualCustomerHref: string;
  manualSaveMessage: string;
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
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [documentOcrFilename, setDocumentOcrFilename] = useState("");
  const [documentOcrMeta, setDocumentOcrMeta] = useState<OcrMeta | null>(null);
  const [documentOcrStatus, setDocumentOcrStatus] = useState("");
  const [savedPreset, setSavedPreset] = useState<FieldMap | null>(null);
  const [presetMessage, setPresetMessage] = useState("");
  const requiredFields = template.fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !fieldMap[field.key]);
  const complete = missingRequiredFields.length === 0;
  const isMaster = uploadType === "customer-master";
  const externalPlaceLinkKeys = ["naverPlaceUrl", "kakaoPlaceUrl", "googleMapUrl"];
  const manualCoreFields = template.fields.filter((field) => !externalPlaceLinkKeys.includes(field.key));
  const manualPlaceLinkFields = template.fields.filter((field) => externalPlaceLinkKeys.includes(field.key));
  const manualBusinessNumber = String(manualDraft.businessRegistrationNumber ?? "");
  const manualBusinessNumberValid = !isMaster || isValidBusinessRegistrationNumber(manualBusinessNumber);
  const manualMissingRequiredFields = template.fields.filter((field) => field.required && !String(manualDraft[field.key] ?? "").trim());
  const manualAddressSelected = !isMaster || Boolean(String(manualDraft.address ?? "").trim());
  const manualComplete =
    manualMissingRequiredFields.length === 0 && manualBusinessNumberValid;
  const canAnalyze = rawRows.length > 0 && complete;
  const mappedRequiredCount = requiredFields.length - missingRequiredFields.length;
  const mappingProgress = requiredFields.length ? Math.round((mappedRequiredCount / requiredFields.length) * 100) : 100;
  const dataQuality = useMemo(() => summarizeDataQuality(rawRows, requiredFields, fieldMap), [fieldMap, rawRows, requiredFields]);
  const uploadHint = isMaster
    ? "사업자 정보, 배송주소, 대표자, 연락처를 회사의 거래처 마스터로 저장합니다."
    : "거래처 key와 매출 행을 누적해 일/월/분기/반기/연 분석과 이탈 징후를 갱신합니다.";
  const saveHint = isMaster
    ? "기초값은 고정 보존하고, 새 엑셀은 기존 거래처 수정과 신규 거래처 등록으로 반영합니다."
    : "매출 엑셀은 거래내역으로 누적 저장하고, 같은 거래처는 매출 추이와 품목 변화를 다시 계산합니다.";
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
      detail: pipelineMeta.persisted ? "운영 화면 반영 확인" : "저장 버튼 실행 후 확인됩니다.",
      label: "서버 반영",
      ok: pipelineMeta.persisted
    }
  ];
  const readyCheckCount = saveReadinessItems.filter((item) => item.ok).length;
  const registrationControlState =
    pipelineMeta.persisted
      ? {
          helper: "거래처 히스토리, 배송 코스, AI 리포트에서 같은 데이터 기준으로 확인할 수 있습니다.",
          label: "운영 반영 완료",
          tone: "ready" as const
        }
      : canAnalyze
        ? {
            helper: "검증·저장 실행을 누르면 서버 저장과 리포트 갱신을 함께 시도합니다.",
            label: "저장 실행 가능",
            tone: "action" as const
          }
        : hasDataRows
          ? {
              helper: missingRequiredFields.length ? `${missingRequiredFields.map((field) => field.label).join(", ")} 필수 컬럼을 연결하세요.` : "품질 오류를 확인한 뒤 저장을 실행하세요.",
              label: "매핑 확인 필요",
              tone: "warning" as const
            }
          : {
              helper: entryMode === "excel" ? "여러 거래처나 매출 거래내역은 엑셀로 한 번에 등록하세요." : entryMode === "document" ? "OCR은 사업자등록증을 보고 기본값을 빠르게 채우는 보조 방법입니다." : "신규 매장 1곳은 주소 검색과 사업자번호 확인 후 바로 저장하세요.",
              label: "등록 대기",
              tone: "idle" as const
            };
  const flowSteps = [
    {
      description: isMaster ? "거래처 마스터는 히스토리와 배송 코스의 기준값입니다." : "매출 거래내역은 등급, 이탈, 리포트의 기준값입니다.",
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
      description: pipelineMeta.persisted ? "서버 저장 후 리포트와 운영 화면에 반영됐습니다." : "업데이트 후 리포트 갱신을 눌러 서버 저장을 확인합니다.",
      done: pipelineMeta.persisted,
      label: "반영",
      value: pipelineMeta.persisted ? "서버 저장" : "저장 확인 전"
    }
  ];
  const reviewTabs = [
    {
      description: "ERP 헤더와 MAJU 표준 필드를 연결합니다.",
      key: "mapping" as const,
      label: "컬럼 매핑",
      step: "3-1",
      value: rawRows.length ? `${mappedRequiredCount}/${requiredFields.length}` : "대기"
    },
    {
      description: "누락값, 사업자번호 오류, 중복 후보를 확인합니다.",
      key: "quality" as const,
      label: "품질 검증",
      step: "3-2",
      value: hasBlockingQualityIssues ? "보완 필요" : hasDataRows ? "정상" : "대기"
    },
    {
      description: "서버 저장 조건과 최근 등록 이력을 확인합니다.",
      key: "save" as const,
      label: "저장·이력",
      step: "3-3",
      value: pipelineMeta.persisted ? "반영 완료" : canAnalyze ? "실행 가능" : "대기"
    }
  ];
  const adminCompanyId = getAdminCompanyIdFromUrl();
  const pairedTemplateType: UploadTemplateType = uploadType === "customer-master" ? "sales-analysis" : "customer-master";
  const currentExportAction = uploadType === "customer-master" ? onDownloadCustomerExport : onDownloadSalesExport;
  const currentExportLabel = uploadType === "customer-master" ? "현재 거래처 데이터" : "현재 매출 거래내역";
  const pairedTemplateLabel = uploadType === "customer-master" ? "매출 양식도 받기" : "거래처 양식도 받기";
  const currentLedgerPath = uploadType === "customer-master" ? "/crm/timeline" : "/revenue/transactions";
  const currentLedgerHref = adminCompanyId ? `${currentLedgerPath}?companyId=${encodeURIComponent(adminCompanyId)}` : currentLedgerPath;
  const currentLedgerLabel = uploadType === "customer-master" ? "거래처 히스토리 보기" : "매출 원장 보기";
  const dashboardHref = adminCompanyId ? `/dashboard?companyId=${encodeURIComponent(adminCompanyId)}` : "/dashboard";
  const routeHref = adminCompanyId ? `/routes/today?companyId=${encodeURIComponent(adminCompanyId)}` : "/routes/today";

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

  async function searchAddress() {
    const query = addressQuery.trim();
    if (query.length < 2) {
      setAddressSearchMessage("주소 검색어를 2글자 이상 입력하세요.");
      return;
    }

    setIsSearchingAddress(true);
    setAddressSearchMessage("");
    const response = await fetch(`/api/address-search?query=${encodeURIComponent(query)}`, { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    const results = Array.isArray(payload?.results) ? payload.results : [];

    setAddressResults(results);
    setAddressSearchMessage(results.length ? `${results.length}개 주소를 찾았습니다.` : payload?.message || "검색 결과가 없습니다.");
    setIsSearchingAddress(false);
  }

  function selectAddress(result: AddressSearchResult) {
    onManualChange({
      ...manualDraft,
      address: result.address,
      region: result.region || extractRegion(result.address)
    });
    setAddressQuery(result.address);
    setAddressResults([]);
    setAddressSearchMessage("선택한 주소를 배송주소에 반영했습니다.");
  }

  async function applyDocumentOcr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    onUploadType("customer-master");
    setDocumentOcrFilename(file.name);
    setDocumentOcrStatus("OCR 추출 중입니다. 잠시만 기다려주세요.");

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
        : `${template.label} 매핑을 이 브라우저에 저장했습니다. 서버 저장은 환경 확인이 필요합니다.`
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

  return (
    <section className="space-y-4">
      <div className="space-y-4">
        <RegistrationControlStrip
          canAnalyze={canAnalyze}
          entryMode={entryMode}
          filename={uploadedFilename}
          isAnalyzing={isAnalyzing}
          latestUploadAt={latestUpload?.createdAt}
          onAnalyze={onAnalyze}
          persisted={pipelineMeta.persisted}
          readyCount={readyCheckCount}
          rows={rawRows.length}
          state={registrationControlState}
          totalCount={saveReadinessItems.length}
          typeLabel={template.label}
        />
        <DataRegistrationFlowCard steps={flowSteps} />
        <OperationalDataSplit
          activeType={uploadType}
          latestUploadAt={latestUpload?.createdAt}
          onSelect={onUploadType}
          rowsWaiting={rawRows.length}
        />

        <div className="rounded-xl border border-l-4 border-slate-200 border-l-blue-600 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="mb-3 bg-blue-50 text-blue-700">2. 어떻게 등록하나요?</Badge>
              <h2 className="text-xl font-black text-slate-950">{template.label}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">대량 등록은 엑셀, 신규 1건은 수기 등록이 기본입니다. OCR은 사업자등록증이 있을 때 값을 빠르게 채우는 보조 방법입니다.</p>
            </div>
            <RegistrationMethodCards
              activeMode={entryMode}
              onSelect={(mode) => {
                if (mode === "document") onUploadType("customer-master");
                setEntryMode(mode);
              }}
            />
          </div>

          {entryMode === "excel" ? (
            <>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center transition hover:bg-blue-50">
                <Upload className="mb-4 h-11 w-11 text-blue-700" />
                <span className="text-lg font-black text-slate-950">엑셀 파일을 여기에 올리세요</span>
                <span className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">ERP 양식이 달라도 괜찮습니다. 파일을 올리면 헤더를 읽고 오른쪽에서 필수 컬럼을 자동 매핑합니다.</span>
                <span className="mt-4 rounded-md bg-white px-3 py-2 text-xs font-black text-blue-700">.xlsx · .csv 지원</span>
                <input className="sr-only" type="file" accept=".xlsx,.csv" onChange={onFile} />
              </label>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">업로드 순서</p>
                <div className="mt-3 space-y-2">
                  {[
                    ["1", "자료 다운로드 영역에서 현재 양식을 받습니다."],
                    ["2", "ERP 엑셀의 헤더와 값을 확인한 뒤 파일을 올립니다."],
                    ["3", "컬럼 매핑 탭에서 필수 필드를 연결하고 상단에서 저장합니다."]
                  ].map(([step, text]) => (
                    <div key={step} className="flex gap-2 rounded-md border border-slate-100 bg-white px-3 py-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-700 text-[11px] font-black text-white">{step}</span>
                      <p className="text-xs font-bold leading-5 text-slate-600">{text}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">{saveHint}</p>
              </div>
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
              manualComplete={manualComplete}
              manualDraft={manualDraft}
              ocrMeta={documentOcrMeta}
              ocrStatus={documentOcrStatus}
              onDocumentFile={applyDocumentOcr}
              onManualChange={onManualChange}
              onManualSave={onManualSave}
            />
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-950">수기로 1건 등록</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">주소 검색, 필수값, 사업자번호 검증을 통과한 건만 저장 대기 목록에 추가됩니다.</p>
                    {manualSaveMessage ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2">
                        <p className="text-xs font-black text-blue-700">{manualSaveMessage}</p>
                        {lastManualCustomerHref ? (
                          <Link className="inline-flex h-7 items-center justify-center rounded-md bg-teal-700 px-2.5 text-xs font-black text-white shadow-sm" href={lastManualCustomerHref}>
                            히스토리에서 확인
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <Button className="shrink-0" onClick={onManualSave} disabled={!manualComplete || isManualSaving}>
                    <Save size={18} />
                    {isManualSaving ? "저장 중" : "검증 후 저장"}
                  </Button>
                </div>

                {isMaster ? (
                  <ManualEntryProgress
                    addressSelected={manualAddressSelected}
                    businessNumberValid={manualBusinessNumberValid}
                    missingFields={manualMissingRequiredFields}
                    ready={manualComplete}
                  />
                ) : null}

                {isMaster ? (
                  <div className="mt-4 rounded-md border border-blue-100 bg-white p-3">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                      <MapPin className="h-4 w-4 text-blue-700" />
                      배송주소 API 검색
                    </div>
                    <div className="mt-3 flex flex-col gap-2 lg:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className="h-11 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
                          onChange={(event) => setAddressQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              searchAddress();
                            }
                          }}
                          placeholder="예: 서울 성동구 성수이로 88"
                          value={addressQuery}
                        />
                      </div>
                      <Button className="h-11 shrink-0" disabled={isSearchingAddress} onClick={searchAddress} type="button" variant="outline">
                        <Search size={16} />
                        {isSearchingAddress ? "검색 중" : "검색"}
                      </Button>
                    </div>
                    {String(manualDraft.address ?? "").trim() ? (
                      <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                        선택 주소: {String(manualDraft.address)}
                      </div>
                    ) : null}
                    {addressSearchMessage ? <p className="mt-2 text-xs font-bold text-slate-500">{addressSearchMessage}</p> : null}
                    {addressResults.length ? (
                      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                        {addressResults.map((result) => (
                          <button
                            className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                            key={`${result.address}-${result.longitude}-${result.latitude}`}
                            onClick={() => selectAddress(result)}
                            type="button"
                          >
                            <span className="block text-sm font-black text-slate-950">{result.address}</span>
                            {result.jibunAddress && result.jibunAddress !== result.address ? <span className="mt-1 block text-xs font-bold text-slate-500">지번 {result.jibunAddress}</span> : null}
                            <span className="mt-1 block text-xs font-bold text-blue-700">
                              {result.region || "지역 자동 추출"} {result.postalCode ? `· 우편번호 ${result.postalCode}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {manualCoreFields.map((field) => {
                    const isInvalidBusinessNumber = field.key === "businessRegistrationNumber" && isMaster && Boolean(manualBusinessNumber) && !manualBusinessNumberValid;
                    const isAddressField = field.key === "address" && isMaster;
                    return (
                      <label key={field.key} className={`space-y-1.5 rounded-md border bg-white p-3 ${isInvalidBusinessNumber ? "border-rose-200" : isAddressField && manualAddressSelected ? "border-emerald-200" : "border-slate-200"}`}>
                        <span className="text-xs font-black text-slate-500">
                          {field.label}
                          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                        </span>
                        <input
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
                          inputMode={manualInputMode(field.key)}
                          type={manualInputType(field.key)}
                          value={String(manualDraft[field.key] ?? "")}
                          onChange={(event) => onManualChange({ ...manualDraft, [field.key]: event.target.value })}
                          placeholder={field.description || `${field.label} 입력`}
                        />
                        {field.key === "businessRegistrationNumber" && isMaster ? (
                          <span className={`block text-xs font-black ${manualBusinessNumber ? (manualBusinessNumberValid ? "text-emerald-700" : "text-rose-600") : "text-slate-400"}`}>
                            {manualBusinessNumber ? (manualBusinessNumberValid ? `${formatBusinessRegistrationNumber(manualBusinessNumber)} 검증 완료` : "유효하지 않은 번호입니다. 10자리와 체크값을 확인하세요.") : "사업자등록번호 10자리를 입력하세요."}
                          </span>
                        ) : null}
                        {isAddressField ? <span className="block text-xs font-bold text-blue-700">검색 결과 선택 시 지역이 자동 반영됩니다.</span> : null}
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

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">양식 · 내보내기</p>
              <p className="mt-1 text-xs font-bold text-slate-500">처음 등록할 양식과 현재 운영 데이터를 구분해서 내려받습니다.</p>
            </div>
            <Badge className="w-fit bg-slate-100 text-slate-600">{template.label}</Badge>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            <DownloadActionCard
              description={`${template.label} 업로드에 맞는 표준 헤더와 작성 가이드를 받습니다.`}
              icon={Download}
              label="업로드 양식"
              tone="primary"
              value="빈 양식 다운로드"
              onClick={() => onDownloadTemplate(uploadType)}
            />
            <DownloadActionCard
              description="현재 저장된 운영 데이터를 백업하거나 ERP 보정 작업에 사용합니다."
              icon={FileSpreadsheet}
              label="현재 데이터"
              value={`${currentExportLabel} 받기`}
              onClick={currentExportAction}
            />
            <DownloadActionCard
              description={uploadType === "customer-master" ? "기초 등록 후 매출 거래내역을 이어서 준비합니다." : "매출 분석 전 거래처 기준값을 보완합니다."}
              icon={Download}
              label="연계 양식"
              value={pairedTemplateLabel}
              onClick={() => onDownloadTemplate(pairedTemplateType)}
            />
            <Link className="rounded-md border border-slate-200 bg-white p-3 transition hover:border-teal-200 hover:bg-teal-50/40" href={currentLedgerHref}>
              <span className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
                  <Banknote size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-slate-500">반영 확인</span>
                  <span className="mt-1 block text-sm font-black text-slate-950">{currentLedgerLabel}</span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">저장 후 운영 화면에서 같은 데이터 기준을 확인합니다.</span>
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border border-l-4 border-slate-200 border-l-violet-600 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-violet-50/40 p-5">
            <Badge className="mb-3 bg-violet-50 text-violet-700">3. 미리보기 · 매핑 · 저장</Badge>
            <h2 className="text-lg font-black text-slate-950">엑셀 전체 미리보기와 컬럼 매칭</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
              {rawRows.length ? `${rawRows.length}개 행 전체를 확인하고, ERP 헤더를 MAJU 표준 필드에 연결한 뒤 저장합니다.` : "엑셀 업로드 또는 수기 저장 후 이곳에서 확인합니다."}
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
            {isAnalyzing ? (
              <PipelineStatusPanel steps={pipelineSteps} meta={pipelineMeta} />
            ) : (
              <>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <div className="grid gap-2 md:grid-cols-3">
                    {reviewTabs.map((tab) => {
                      const selected = reviewTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          className={`rounded-md border p-3 text-left transition ${
                            selected
                              ? "border-violet-300 bg-white text-violet-900 shadow-sm ring-1 ring-violet-100"
                              : "border-transparent bg-transparent text-slate-500 hover:bg-white/80 hover:text-slate-800"
                          }`}
                          onClick={() => setReviewTab(tab.key)}
                          type="button"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-black ${selected ? "bg-violet-100 text-violet-800" : "bg-white text-slate-500"}`}>
                                {tab.step}
                              </span>
                              <span className="mt-2 block text-sm font-black">{tab.label}</span>
                              <span className={`mt-1 block text-xs font-bold leading-5 ${selected ? "text-violet-700" : "text-slate-500"}`}>{tab.description}</span>
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${selected ? "bg-violet-700 text-white" : "bg-white text-slate-500"}`}>
                              {tab.value}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {reviewTab === "mapping" ? (
                  <>
                    <ExcelHeaderMappingPreview
                      fields={template.fields}
                      fieldMap={fieldMap}
                      headers={headers}
                      onMap={onMap}
                      rows={rawRows}
                    />
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
                {reviewTab === "quality" ? <DataQualityCard summary={dataQuality} onDownloadIssues={downloadIssueRows} /> : null}
                {reviewTab === "save" ? (
                  <>
                    <SaveReadinessPanel items={saveReadinessItems} canAnalyze={canAnalyze} />
                    <OperationalHandoffPanel
                      dashboardHref={dashboardHref}
                      ledgerHref={currentLedgerHref}
                      ledgerLabel={currentLedgerLabel}
                      routeHref={routeHref}
                      typeLabel={template.label}
                    />
                    <RecentUploadHistoryCard uploads={uploadHistory} />
                  </>
                ) : null}
                {!headers.length ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <p className="font-black text-slate-950">아직 저장 대기 데이터가 없습니다.</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">중앙에서 엑셀을 업로드하거나 수기로 입력하면 매핑 상태가 표시됩니다.</p>
                  </div>
                ) : null}
                <SaveResultSummary
                  canAnalyze={canAnalyze}
                  ledgerHref={currentLedgerHref}
                  ledgerLabel={currentLedgerLabel}
                  missingRequiredFields={missingRequiredFields}
                  persisted={pipelineMeta.persisted}
                  registrationStatus={registrationStatus}
                  rows={rawRows.length}
                />
              </>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}

function RegistrationControlStrip({
  canAnalyze,
  entryMode,
  filename,
  isAnalyzing,
  latestUploadAt,
  onAnalyze,
  persisted,
  readyCount,
  rows,
  state,
  totalCount,
  typeLabel
}: {
  canAnalyze: boolean;
  entryMode: EntryMode;
  filename: string;
  isAnalyzing: boolean;
  latestUploadAt?: string;
  onAnalyze: () => void;
  persisted: boolean;
  readyCount: number;
  rows: number;
  state: { helper: string; label: string; tone: "action" | "idle" | "ready" | "warning" };
  totalCount: number;
  typeLabel: string;
}) {
  const toneClassName = {
    action: "border-blue-200 bg-blue-50/80 text-blue-800",
    idle: "border-slate-200 bg-white text-slate-700",
    ready: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
    warning: "border-amber-200 bg-amber-50/80 text-amber-800"
  }[state.tone];
  const progress = Math.round((readyCount / totalCount) * 100);
  const waitingActionLabel = entryMode === "excel" ? "엑셀 업로드 필요" : entryMode === "manual" ? "수기 입력 필요" : "OCR 또는 수기 입력 필요";
  const waitingActionHelper =
    entryMode === "excel"
      ? "파일 업로드 후 필수 컬럼을 모두 연결하면 버튼이 활성화됩니다."
      : entryMode === "manual"
        ? "수기 등록 폼에서 필수값과 사업자번호를 확인하면 저장할 수 있습니다."
        : "OCR은 보조 기능입니다. 파일이 없으면 수기 등록으로 바로 진행하세요.";
  const actionTitle = canAnalyze ? "운영 데이터로 반영" : rows ? "필수 조건 확인" : waitingActionLabel;
  const actionDescription = canAnalyze
    ? "원본 저장, 정제, 리포트 갱신을 한 번에 실행합니다."
    : rows
      ? "필수 컬럼과 품질 오류를 먼저 해결해야 저장할 수 있습니다."
      : waitingActionHelper;

  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClassName}`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px_220px] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white/80 text-slate-800 ring-1 ring-inset ring-slate-200">{typeLabel}</Badge>
            <Badge className={state.tone === "ready" ? "bg-emerald-700 text-white" : state.tone === "action" ? "bg-blue-700 text-white" : state.tone === "warning" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}>
              {state.label}
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-black text-slate-950">데이터 등록 관제판</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{state.helper}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-md border border-white/80 bg-white/70 px-2.5 py-1 text-slate-600">
              서버 반영: {persisted ? "완료" : "확인 전"}
            </span>
            <span className="rounded-md border border-white/80 bg-white/70 px-2.5 py-1 text-slate-600">
              최근 이력: {latestUploadAt || "없음"}
            </span>
          </div>
        </div>
        <div className="grid gap-2 rounded-md border border-white/70 bg-white/75 p-3 sm:grid-cols-3 xl:grid-cols-1">
          <MiniStatus label="등록 방식" value={entryMode === "excel" ? "대량 등록" : entryMode === "document" ? "OCR 보조" : "수기 등록"} />
          <MiniStatus label="대기 데이터" value={rows ? `${rows.toLocaleString()}행` : "없음"} />
          <MiniStatus label="현재 파일" value={rows ? filename : "업로드 전"} />
          <div className="sm:col-span-3 xl:col-span-1">
            <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-500">
              <span>저장 준비</span>
              <span>{readyCount}/{totalCount}</span>
            </div>
            <Progress value={progress} />
          </div>
        </div>
        <div className="rounded-md border border-white/80 bg-white/90 p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md ${canAnalyze ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}>
              {canAnalyze ? <Database className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-500">다음 실행</p>
              <p className="mt-1 text-sm font-black text-slate-950">{actionTitle}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{actionDescription}</p>
            </div>
          </div>
          <Button className="mt-3 h-11 w-full" disabled={!canAnalyze || isAnalyzing} onClick={onAnalyze}>
            {isAnalyzing ? "저장 중" : canAnalyze ? "저장하고 리포트 갱신" : "저장 조건 확인 중"}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {canAnalyze ? (
            <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-black text-blue-700">
              <span className="rounded-md bg-blue-50 px-2 py-1 text-center">DB 저장</span>
              <span className="rounded-md bg-blue-50 px-2 py-1 text-center">원장 반영</span>
              <span className="rounded-md bg-blue-50 px-2 py-1 text-center">AI 갱신</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RegistrationMethodCards({ activeMode, onSelect }: { activeMode: EntryMode; onSelect: (mode: EntryMode) => void }) {
  const methods = [
    {
      badge: "기본",
      description: "거래처 마스터나 매출 거래내역을 한 번에 많이 등록할 때 사용합니다.",
      icon: Upload,
      id: "excel" as EntryMode,
      label: "대량 등록",
      meta: "엑셀 업로드",
      next: "파일 업로드 → 전체 미리보기 → 컬럼 매핑"
    },
    {
      badge: "자주 사용",
      description: "신규 매장 1곳을 바로 추가하거나 현장에서 정보를 보완할 때 사용합니다.",
      icon: Building2,
      id: "manual" as EntryMode,
      label: "수기 등록",
      meta: "신규 1곳",
      next: "주소 검색 → 사업자번호 확인 → 저장"
    },
    {
      badge: "선택",
      description: "사업자등록증 파일이 있을 때 수기 입력값을 빠르게 채우는 보조 기능입니다.",
      icon: FileSpreadsheet,
      id: "document" as EntryMode,
      label: "OCR 보조",
      meta: "필수 아님",
      next: "파일 업로드 → 후보값 확인 → 수기 보정"
    }
  ];

  return (
    <div className="grid w-full gap-2 lg:grid-cols-3 xl:w-[760px]">
      {methods.map((method) => {
        const selected = activeMode === method.id;
        const Icon = method.icon;

        return (
          <button
            key={method.id}
            className={`group rounded-xl border p-3 text-left transition ${
              selected
                ? "border-blue-700 bg-blue-700 text-white shadow-[0_12px_26px_rgba(29,78,216,0.2)]"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
            }`}
            onClick={() => onSelect(method.id)}
            type="button"
          >
            <span className="flex items-start justify-between gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-blue-700 group-hover:bg-white"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{method.badge}</span>
            </span>
            <span className="mt-3 block text-sm font-black">{method.label}</span>
            <span className={`mt-1 block text-[11px] font-black ${selected ? "text-white/75" : "text-slate-400"}`}>{method.meta}</span>
            <span className={`mt-2 block text-xs font-semibold leading-5 ${selected ? "text-white/80" : "text-slate-500"}`}>{method.description}</span>
            <span className={`mt-3 block rounded-md px-2.5 py-2 text-xs font-black ${selected ? "bg-white/15 text-white" : "bg-slate-50 text-slate-600"}`}>{method.next}</span>
          </button>
        );
      })}
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
      checks: ["사업자번호/상호명", "배송주소/권역", "대표자/연락처", "첨부자료/메모"],
      description: "거래처 히스토리, 지도 마커, 배송차 배정의 기준 데이터입니다.",
      icon: Building2,
      key: "customer-master" as UploadTemplateType,
      label: "거래처 마스터",
      rhythm: "최초 1회 등록 후 수정",
      target: "히스토리 · 지도 · 배송 코스"
    },
    {
      checks: ["거래처 key", "매출일자", "품목/수량", "공급가/총매출"],
      description: "매출 등급, 품목 이탈, 리포트 수치와 영업 우선순위를 갱신합니다.",
      icon: Banknote,
      key: "sales-analysis" as UploadTemplateType,
      label: "매출 거래내역",
      rhythm: "일/월/분기 반복 업데이트",
      target: "등급 · 이탈 · AI 리포트"
    }
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge className="mb-3 bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200">1. 데이터 기준 선택</Badge>
          <h2 className="text-xl font-black text-slate-950">거래처 기준값과 매출 업데이트를 구분하세요</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            거래처 마스터는 기준값이고, 매출 거래내역은 반복 업데이트 데이터입니다. 선택에 따라 필수 컬럼과 검증 기준이 달라집니다.
          </p>
        </div>
        <div className="grid gap-2 text-xs font-black text-slate-500 sm:grid-cols-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">저장 대기 {rowsWaiting.toLocaleString()}행</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">최근 반영 {latestUploadAt || "확인 필요"}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const active = activeType === card.key;

          return (
            <button
              key={card.key}
              className={`rounded-md border p-4 text-left transition ${
                active ? "border-blue-300 bg-blue-50 ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => onSelect(card.key)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950">{card.label}</p>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{card.description}</p>
                  </div>
                </div>
                <Badge className={active ? "bg-white text-blue-800 ring-1 ring-inset ring-blue-100" : "bg-slate-100 text-slate-600"}>
                  {active ? "선택됨" : "선택"}
                </Badge>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <MiniStatus label="업데이트 주기" value={card.rhythm} />
                <MiniStatus label="반영 화면" value={card.target} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {card.checks.map((check) => (
                  <span key={check} className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-600 ring-1 ring-inset ring-slate-200">
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

function DocumentOcrRegistrationPanel({
  filename,
  isManualSaving,
  manualComplete,
  manualDraft,
  ocrMeta,
  ocrStatus,
  onDocumentFile,
  onManualChange,
  onManualSave
}: {
  filename: string;
  isManualSaving: boolean;
  manualComplete: boolean;
  manualDraft: RawRow;
  ocrMeta: OcrMeta | null;
  ocrStatus: string;
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
  const attachmentSlots = [
    { accept: "image/*,.pdf", description: "사업자등록증 원본 이미지/PDF", key: "businessLicense", label: "사업자등록증", required: true },
    { accept: "image/*,.pdf", description: "대표자 또는 담당자 확인자료 · 주민번호/주소 일부 마스킹 후 보관", key: "identity", label: "신분증", required: false },
    { accept: "image/*,.pdf", description: "정산 계좌 확인용 통장 사본", key: "bankbook", label: "통장사본", required: false },
    { accept: "image/*,video/*", description: "배송기사가 확인할 냉장고, 후문, 적재 위치 사진/영상", key: "loadingSpot", label: "배송 적재위치", required: false }
  ];
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, string[]>>({});
  const attachedCount = Object.values(attachmentFiles).reduce((total, files) => total + files.length, 0);
  const confidencePercent = ocrMeta ? Math.round(ocrMeta.confidence * 100) : 0;
  const providerLabel = getOcrProviderLabel(ocrMeta?.provider);
  const ocrModeLabel = ocrMeta?.mode === "sample" ? "샘플 검증" : ocrMeta?.mode === "provider-ready" ? "공급자 준비" : ocrMeta?.mode || "대기";
  const hasBusinessLicense = Boolean(filename || attachmentFiles.businessLicense?.length);
  const requiredAttachmentCount = attachmentSlots.filter((slot) => slot.required).length;
  const readyAttachmentCount = attachmentSlots.filter((slot) => !slot.required || (attachmentFiles[slot.key] || []).length || (slot.key === "businessLicense" && filename)).length;
  const attachmentReady = hasBusinessLicense;

  function onAttachmentFiles(slotKey: string, files: FileList | null) {
    const names = Array.from(files || []).map((file) => file.name);
    if (!names.length) return;

    setAttachmentFiles((current) => ({
      ...current,
      [slotKey]: [...(current[slotKey] || []), ...names]
    }));
  }

  function removeAttachmentFile(slotKey: string, filenameToRemove: string) {
    setAttachmentFiles((current) => ({
      ...current,
      [slotKey]: (current[slotKey] || []).filter((name) => name !== filenameToRemove)
    }));
  }

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-3">
        <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-blue-200 bg-blue-50/60 p-5 text-center transition hover:bg-blue-50">
          <FileSpreadsheet className="mb-4 h-10 w-10 text-blue-700" />
          <span className="text-base font-black text-slate-950">OCR 보조 입력</span>
          <span className="mt-2 text-sm font-semibold leading-6 text-slate-500">사업자등록증 이미지/PDF가 있으면 상호명, 사업자번호, 대표자명, 개업일, 주소 후보를 먼저 채웁니다.</span>
          <span className="mt-4 rounded-md bg-white px-3 py-2 text-xs font-black text-blue-700">선택 기능 · 저장 전 검수</span>
          <input className="sr-only" type="file" accept="image/*,.pdf" onChange={onDocumentFile} />
        </label>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-black text-amber-900">개인정보 보관 기준</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">신분증은 실명 확인용 첨부로만 다루고, 주민등록번호 뒷자리와 불필요한 주소 정보는 마스킹 후 저장하는 흐름으로 설계합니다.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge className="mb-2 bg-blue-100 text-blue-800">보조 입력값 확인</Badge>
              <h3 className="text-lg font-black text-slate-950">{filename || "사업자등록증을 먼저 업로드하세요"}</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{ocrStatus || "파일이 없으면 수기 등록으로 바로 진행해도 됩니다. 업로드 후 후보값을 확인하고 수정하세요."}</p>
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
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
                  onChange={(event) => onManualChange({ ...manualDraft, [key]: event.target.value })}
                  value={String(manualDraft[key] ?? "")}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">첨부자료 보관</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">사업자등록증, 신분증, 통장사본, 배송 적재위치 자료를 매장 생성 전 한 번에 검수합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={attachmentReady ? "w-fit bg-emerald-100 text-emerald-800" : "w-fit bg-amber-100 text-amber-800"}>
                필수 {hasBusinessLicense ? requiredAttachmentCount : 0}/{requiredAttachmentCount}
              </Badge>
              <Badge className="w-fit bg-slate-100 text-slate-700">{attachedCount + (filename ? 1 : 0)}개 선택됨</Badge>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <MiniStatus label="필수 첨부" value={attachmentReady ? "충족" : "사업자등록증 필요"} />
            <MiniStatus label="보관 상태" value={`${readyAttachmentCount}/${attachmentSlots.length} 항목 확인`} />
            <MiniStatus label="확인 필요" value={ocrMeta?.warnings.length ? `${ocrMeta.warnings.length}건` : "없음"} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {attachmentSlots.map((slot) => (
              <div key={slot.label} className={`rounded-md border p-3 ${slot.required && !hasBusinessLicense ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-950">{slot.label}</p>
                  <Badge className={slot.required ? (hasBusinessLicense ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800") : "bg-white text-slate-500"}>
                    {slot.required ? (hasBusinessLicense ? "충족" : "필수") : "선택"}
                  </Badge>
                </div>
                <p className="mt-2 min-h-10 text-xs font-semibold leading-5 text-slate-500">{slot.description}</p>
                {slot.key === "businessLicense" && filename ? (
                  <p className="mt-3 truncate rounded-md bg-white px-2 py-1 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-100">
                    OCR 원본: {filename}
                  </p>
                ) : null}
                {(attachmentFiles[slot.key] || []).length ? (
                  <div className="mt-3 space-y-1">
                    {(attachmentFiles[slot.key] || []).map((name) => (
                      <div key={name} className="flex items-center gap-2 rounded-md bg-white px-2 py-1 ring-1 ring-inset ring-blue-100">
                        <p className="min-w-0 flex-1 truncate text-xs font-black text-blue-700">{name}</p>
                        <button className="shrink-0 text-[11px] font-black text-slate-400 hover:text-rose-600" onClick={() => removeAttachmentFile(slot.key, name)} type="button">
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : !filename || slot.key !== "businessLicense" ? (
                  <p className="mt-3 rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-400 ring-1 ring-inset ring-slate-200">아직 선택된 파일 없음</p>
                ) : null}
                <label className="mt-3 flex h-9 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                  + 파일 추가
                  <input className="sr-only" type="file" accept={slot.accept} multiple onChange={(event) => onAttachmentFiles(slot.key, event.target.files)} />
                </label>
              </div>
            ))}
          </div>
        </div>
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
  const searchQuery = [customerName, address].filter(Boolean).join(" ");
  const searchLinks = buildPlaceSearchLinks(searchQuery);
  const filledCount = fields.filter((field) => String(manualDraft[field.key] ?? "").trim()).length;

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/80 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge className="mb-2 bg-white text-teal-800 ring-1 ring-inset ring-teal-200">운영 링크</Badge>
          <h3 className="text-base font-black text-slate-950">매장 외부 정보 링크</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            네이버, 카카오맵, 구글맵 링크를 저장하면 리뷰·영업시간·폐업 여부 확인의 기준값으로 활용할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {searchLinks.map((link) => (
            <a
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-black transition ${
                searchQuery ? "border-teal-200 bg-white text-teal-800 hover:bg-teal-100" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
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
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-3 md:grid-cols-3">
          {fields.map((field) => (
            <label key={field.key} className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black text-slate-500">{field.label}</span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-200"
                inputMode="url"
                onChange={(event) => onManualChange({ ...manualDraft, [field.key]: event.target.value })}
                placeholder="https://..."
                type="url"
                value={String(manualDraft[field.key] ?? "")}
              />
              <span className="block text-xs font-bold leading-5 text-slate-500">{field.description}</span>
            </label>
          ))}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">등록 상태</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{filledCount}/{fields.length}</p>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            링크는 선택값입니다. 우선 매장을 저장하고, 거래처 히스토리에서 나중에 보완해도 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function ManualEntryProgress({
  addressSelected,
  businessNumberValid,
  missingFields,
  ready
}: {
  addressSelected: boolean;
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
      detail: addressSelected ? "배송주소 선택 완료" : "주소 검색 후 선택",
      label: "주소",
      ok: addressSelected
    },
    {
      detail: businessNumberValid ? "사업자번호 검증 완료" : "10자리 번호 확인",
      label: "사업자번호",
      ok: businessNumberValid
    }
  ];
  const doneCount = items.filter((item) => item.ok).length;

  return (
    <div className={`mt-4 rounded-md border p-3 ${ready ? "border-emerald-200 bg-emerald-50" : "border-blue-100 bg-blue-50/60"}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">수기 등록 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">필수값, 배송주소, 사업자번호가 모두 맞으면 바로 저장할 수 있습니다.</p>
        </div>
        <Badge className={ready ? "bg-emerald-700 text-white" : "bg-blue-700 text-white"}>
          {doneCount}/3 완료
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-md border px-3 py-2 ${item.ok ? "border-emerald-100 bg-white text-emerald-900" : "border-slate-200 bg-white text-slate-700"}`}>
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
    <div className={`mt-3 rounded-md border p-3 ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">대량 등록 준비 상태</p>
          <p className="mt-1 text-xs font-bold text-slate-500">파일 업로드, 필수 컬럼 매핑, 품질 검증이 끝나면 상단에서 바로 서버 저장을 실행합니다.</p>
        </div>
        <Badge className={complete ? "bg-emerald-700 text-white" : "bg-slate-900 text-white"}>
          {doneCount}/4 완료
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`rounded-md border px-3 py-2 ${item.ok ? "border-emerald-100 bg-white text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
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
        body: "먼저 거래처 마스터 또는 매출 거래내역 엑셀을 업로드하세요.",
        buttonLabel: "업로드 후 매핑 확인",
        disabled: true,
        icon: Upload,
        tab: "mapping" as const,
        title: "엑셀 파일을 기다리고 있습니다."
      }
    : missingRequiredFields.length
      ? {
          badge: "매핑 필요",
          body: `${missingRequiredFields.map((field) => field.label).join(", ")} 필수 컬럼을 연결하면 저장 조건이 열립니다.`,
          buttonLabel: "컬럼 매핑 열기",
          disabled: false,
          icon: FileSpreadsheet,
          tab: "mapping" as const,
          title: "필수 컬럼 연결이 남아 있습니다."
        }
      : hasBlockingQualityIssues
        ? {
            badge: "품질 확인",
            body: "중복 후보, 누락값, 사업자번호 오류를 확인한 뒤 저장하는 것이 안전합니다.",
            buttonLabel: "품질 검증 열기",
            disabled: false,
            icon: AlertTriangle,
            tab: "quality" as const,
            title: "보완 필요 행을 확인하세요."
          }
        : {
            badge: canAnalyze ? "저장 가능" : "저장 확인",
            body: "서버 저장, 거래처 원장 반영, AI 리포트 갱신을 실행할 준비가 됐습니다.",
            buttonLabel: "저장·이력 열기",
            disabled: false,
            icon: Check,
            tab: "save" as const,
            title: "운영 데이터 반영 준비가 끝났습니다."
          };
  const Icon = nextAction.icon;

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex items-start gap-3 p-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${nextAction.disabled ? "bg-slate-100 text-slate-500" : "bg-blue-700 text-white"}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Badge className={nextAction.disabled ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}>{nextAction.badge}</Badge>
            <p className="mt-2 text-base font-black text-slate-950">{nextAction.title}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{nextAction.body}</p>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 p-4 lg:border-l lg:border-t-0">
          <p className="text-xs font-black text-slate-500">바로가기</p>
          <Button
            className="mt-2 h-11 w-full"
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
      description: isMaster ? (addressSelected ? "배송주소가 선택되었습니다." : "주소 검색 후 배송주소를 선택하세요.") : "매출 데이터는 거래처 key 기준으로 저장됩니다.",
      label: "주소",
      ok: addressSelected
    },
    {
      description: isMaster
        ? businessNumber
          ? businessNumberValid
            ? `${formatBusinessRegistrationNumber(businessNumber)} 확인 완료`
            : "사업자번호 체크값이 맞지 않습니다."
          : "사업자번호를 입력하세요."
        : "매출 업로드에서는 선택값입니다.",
      label: "사업자번호",
      ok: businessNumberValid
    }
  ];

  const doneCount = checks.filter((check) => check.ok).length;

  return (
    <aside className="space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <ClipboardList className="h-4 w-4 text-blue-700" />
            등록 검증
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">저장 전 필요한 조건을 확인합니다.</p>
        </div>
        <Badge className={ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{ready ? "저장 가능" : "확인 필요"}</Badge>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-500">
          <span>검증 진행률</span>
          <span>{doneCount}/{checks.length}</span>
        </div>
        <Progress value={Math.round((doneCount / checks.length) * 100)} />
      </div>
      <div className="space-y-2">
        {checks.map((check) => (
          <div key={check.label} className={`rounded-md border p-3 ${check.ok ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-900">{check.label}</span>
              {check.ok ? <Check className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{check.description}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-500">저장 후 흐름</p>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-800">
          저장되면 거래처 히스토리에서 기본정보, 메모, 첨부자료, 배송 적재위치를 이어서 관리합니다.
        </p>
      </div>
      {manualSaveMessage ? (
        <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-black text-blue-700">최근 저장 결과</p>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-800">{manualSaveMessage}</p>
        </div>
      ) : null}
      <div className="grid gap-2">
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
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-400">{hasRows ? "업로드됨" : "대기 중"}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{hasRows ? filename : "아직 등록할 데이터가 없습니다."}</p>
        </div>
        <Badge className={complete && hasRows ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {complete && hasRows ? "저장 가능" : "확인 필요"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <MiniStatus label="행" value={`${rows.length}개`} />
        <MiniStatus label="컬럼" value={`${headers.length}개`} />
        <MiniStatus label="필수" value={`${mappedRequiredCount}/${requiredCount}`} />
      </div>
      <div className="p-4">
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
    <div className={`h-full rounded-md border p-4 ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white shadow-sm">{tone.icon}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-950">{status.title}</p>
              <Badge className={tone.badge}>{status.actionLabel}</Badge>
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{status.description}</p>
            <p className="mt-2 rounded-md bg-white/80 px-3 py-2 text-xs font-black leading-5 text-slate-800">다음 액션: {status.nextAction}</p>
          </div>
        </div>
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

function DataQualityCard({ onDownloadIssues, summary }: { onDownloadIssues: () => void; summary: DataQualitySummary }) {
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
  const visibleIssues = issuePreview.slice(0, 5);

  return (
    <div className={`mb-4 overflow-hidden rounded-md border bg-white ${hasIssues ? "border-amber-200" : "border-emerald-100"}`}>
      <div className={`flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-start lg:justify-between ${hasIssues ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            {hasIssues ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <Check className="h-4 w-4 text-emerald-700" />}
            행 데이터 품질
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            {hasRows ? "필수값 누락, 사업자번호 유효성, 중복 후보를 저장 전에 확인합니다." : "엑셀을 올리면 행 단위 검증 결과가 표시됩니다."}
          </p>
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
        <MiniStatus label="정상 행" value={`${summary.readyRows.toLocaleString()}개`} />
        <MiniStatus label="보완 행" value={`${rowIssueCount.toLocaleString()}개`} />
        <MiniStatus label="사업자 오류" value={`${summary.invalidBusinessNumbers.length.toLocaleString()}개`} />
        <MiniStatus label="중복 후보" value={`${summary.duplicateCandidates.toLocaleString()}개`} />
      </div>
      <div className="border-t border-slate-100 p-4">
        {!hasRows ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-sm font-black text-slate-950">검증할 행이 아직 없습니다.</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">엑셀 업로드 또는 수기 등록을 완료하면 저장 가능 여부가 이곳에 표시됩니다.</p>
          </div>
        ) : hasRowIssues ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950">먼저 보완할 행</p>
                <p className="mt-1 text-xs font-bold text-slate-500">아래 행은 서버 저장 전에 값 확인이 필요합니다.</p>
              </div>
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={onDownloadIssues} size="sm">
                <Download className="h-4 w-4" />
                문제 행 엑셀 다운로드
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <div className="grid grid-cols-[72px_120px_minmax(0,1fr)] bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500">
                <span>행 번호</span>
                <span>유형</span>
                <span>보완 내용</span>
              </div>
              {visibleIssues.map((issue) => (
                <div key={`${issue.type}-${issue.rowNumber}`} className="grid grid-cols-[72px_120px_minmax(0,1fr)] items-start border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                  <span className="font-black text-slate-950">{issue.rowNumber}행</span>
                  <span>
                    <Badge className={issue.tone === "rose" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}>{issue.type}</Badge>
                  </span>
                  <span className="leading-5">{issue.detail}</span>
                </div>
              ))}
            </div>
            {issuePreview.length > visibleIssues.length ? <p className="text-xs font-bold text-amber-700">외 {issuePreview.length - visibleIssues.length}개 문제 행은 다운로드 파일에서 확인하세요.</p> : null}
          </div>
        ) : (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-900">저장 차단 오류가 없습니다.</p>
            <p className="mt-1 text-xs font-bold leading-5 text-emerald-700">중복 후보만 확인하면 업데이트 후 리포트 갱신을 진행할 수 있습니다.</p>
          </div>
        )}
        {summary.duplicateCandidates > 0 ? (
          <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-xs font-black text-blue-900">중복 후보 {summary.duplicateCandidates.toLocaleString()}개</p>
            <p className="mt-1 text-xs font-bold leading-5 text-blue-700">사업자번호 또는 거래처명+주소가 같은 행입니다. 기존 거래처 업데이트인지 신규 등록인지 확인하세요.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SaveReadinessPanel({
  canAnalyze,
  items
}: {
  canAnalyze: boolean;
  items: Array<{ detail: string; label: string; ok: boolean }>;
}) {
  const readyCount = items.filter((item) => item.ok).length;
  const blockingItems = items.filter((item) => !item.ok && item.label !== "서버 반영");
  const progress = items.length ? Math.round((readyCount / items.length) * 100) : 0;
  const nextStep =
    blockingItems[0]?.label ||
    (canAnalyze ? "검증·저장 실행" : items.find((item) => !item.ok)?.label || "운영 화면 확인");

  return (
    <div className={`overflow-hidden rounded-md border bg-white ${canAnalyze ? "border-emerald-200" : "border-amber-200"}`}>
      <div className={`grid gap-4 border-b px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center ${canAnalyze ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-black text-slate-950">
              {canAnalyze ? <Check className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
              저장 실행 점검
            </p>
            <Badge className={canAnalyze ? "bg-emerald-700 text-white" : "bg-amber-500 text-white"}>
              {canAnalyze ? "실행 가능" : "확인 필요"}
            </Badge>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {canAnalyze ? "검증·저장 실행 후 거래처 히스토리, 매출 원장, AI 리포트에 같은 기준으로 반영됩니다." : `${blockingItems.map((item) => item.label).join(", ") || "서버 반영"} 조건을 먼저 확인하세요.`}
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
      <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3 px-4 py-4">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${item.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {item.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-slate-950">{item.label}</p>
                <Badge className={item.ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{item.ok ? "완료" : "대기"}</Badge>
              </div>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-xs font-black text-slate-500">반영 확인 위치</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-700">거래처 마스터는 거래처 히스토리와 영업·배송 코스에, 매출 거래내역은 매출 원장과 AI 리포트에 반영됩니다.</p>
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
      badge: "서버 반영 완료",
      body: "서버 저장이 확인됐습니다. 운영 화면에서 같은 데이터 기준으로 확인할 수 있습니다.",
      className: "border-emerald-200 bg-emerald-50",
      icon: <Check className="h-4 w-4 text-emerald-700" />,
      title: "데이터 등록이 운영 화면에 반영됐습니다."
    },
    ready: {
      badge: "저장 가능",
      body: "상단 데이터 등록 관제판에서 검증·저장 실행을 누르면 서버 저장과 리포트 갱신을 함께 시도합니다.",
      className: "border-blue-200 bg-blue-50",
      icon: <Check className="h-4 w-4 text-blue-700" />,
      title: "저장 실행 준비가 끝났습니다."
    }
  }[mode];

  return (
    <div className={`rounded-md border p-4 ${copy.className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{copy.badge}</Badge>
          <p className="mt-2 flex items-center gap-2 text-base font-black text-slate-950">
            {copy.icon}
            {copy.title}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{copy.body}</p>
          <p className="mt-2 rounded-md bg-white/75 px-3 py-2 text-xs font-black leading-5 text-slate-700">최근 상태: {registrationStatus.title}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge className="bg-white text-slate-600 ring-1 ring-inset ring-slate-200">{rows.toLocaleString()}행 대기</Badge>
          {persisted ? (
            <Link className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm hover:bg-teal-800" href={ledgerHref}>
              {ledgerLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OperationalHandoffPanel({
  dashboardHref,
  ledgerHref,
  ledgerLabel,
  routeHref,
  typeLabel
}: {
  dashboardHref: string;
  ledgerHref: string;
  ledgerLabel: string;
  routeHref: string;
  typeLabel: string;
}) {
  const items = [
    {
      description: "등록된 거래처와 매출 기준으로 회사 현황 KPI를 먼저 확인합니다.",
      href: dashboardHref,
      icon: BarChart3,
      label: "대시보드",
      step: "1"
    },
    {
      description: typeLabel.includes("매출") ? "거래원장 업로드 내역과 품목·기간별 매출을 확인합니다." : "매장 기본정보, 메모, 첨부자료, 배송 적재위치를 확인합니다.",
      href: ledgerHref,
      icon: ClipboardList,
      label: ledgerLabel,
      step: "2"
    },
    {
      description: "거래처 주소와 배송 담당자 기준으로 지도, 거리, 코스 반영 상태를 확인합니다.",
      href: routeHref,
      icon: Route,
      label: "영업·배송 코스",
      step: "3"
    }
  ];

  return (
    <div className="overflow-hidden rounded-md border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-teal-100 bg-teal-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">저장 후 운영 확인 순서</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{typeLabel} 등록 후 같은 데이터 기준으로 확인해야 하는 화면입니다.</p>
        </div>
        <Badge className="w-fit bg-white text-teal-800 ring-1 ring-inset ring-teal-200">운영 연결</Badge>
      </div>
      <div className="grid gap-0 md:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className="group border-b border-slate-100 p-4 transition hover:bg-teal-50/50 md:border-b-0 md:border-r last:md:border-r-0"
              href={item.href}
              key={item.label}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">STEP {item.step}</span>
                  <p className="mt-2 text-sm font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
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

function DownloadActionCard({
  description,
  icon: Icon,
  label,
  onClick,
  tone = "default",
  value
}: {
  description: string;
  icon: typeof Download;
  label: string;
  onClick: () => void;
  tone?: "default" | "primary";
  value: string;
}) {
  return (
    <button
      className={`rounded-md border p-3 text-left transition ${
        tone === "primary"
          ? "border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100"
          : "border-slate-200 bg-white text-slate-950 hover:border-blue-100 hover:bg-blue-50/40"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${tone === "primary" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>
          <Icon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-black text-slate-500">{label}</span>
          <span className="mt-1 block text-sm font-black text-slate-950">{value}</span>
          <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{description}</span>
        </span>
      </span>
    </button>
  );
}

function RecentUploadHistoryCard({ uploads }: { uploads: UploadHistoryRow[] }) {
  const latestUploads = uploads.slice(0, 4);
  const completedCount = uploads.filter((upload) => upload.status === "completed").length;
  const failedCount = uploads.filter((upload) => upload.status === "failed").length;
  const averageQuality = uploads.length ? Math.round(uploads.reduce((sum, upload) => sum + upload.qualityScore, 0) / uploads.length) : 0;

  return (
    <div className="mb-4 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <History className="h-4 w-4 text-slate-500" />
            최근 등록 이력
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">서버에 남은 업로드 결과와 품질, 중복 후보를 확인합니다.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs lg:min-w-[320px]">
          <MiniStatus label="완료" value={`${completedCount.toLocaleString()}건`} />
          <MiniStatus label="실패" value={`${failedCount.toLocaleString()}건`} />
          <MiniStatus label="평균 품질" value={uploads.length ? `${averageQuality}%` : "-"} />
        </div>
      </div>

      {latestUploads.length ? (
        <div className="divide-y divide-slate-100">
          {latestUploads.map((upload) => (
            <div key={upload.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_220px_120px] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-black text-slate-900">{upload.filename}</p>
                  <Badge className={upload.status === "completed" ? "bg-emerald-100 text-emerald-800" : upload.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                    {upload.status === "completed" ? "완료" : upload.status === "failed" ? "실패" : "진행중"}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {upload.createdAt}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MiniStatus label="행" value={`${upload.rows.toLocaleString()}개`} />
                <MiniStatus label="중복" value={`${upload.duplicateCount.toLocaleString()}개`} />
                <MiniStatus label="건강도" value={`${upload.healthScore}점`} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-500">
                  <span>품질</span>
                  <span>{upload.qualityScore}%</span>
                </div>
                <Progress value={upload.qualityScore} />
                <Link className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50" href={`/reports/${upload.reportId}`}>
                  리포트 확인
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-sm font-black text-slate-900">아직 서버 등록 이력이 없습니다.</p>
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
    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
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
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3 text-lg font-black">
          <Activity className="h-6 w-6 animate-pulse text-primary" />
          데이터 적재 파이프라인 실행 중
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          원본 데이터부터 정제 데이터, Health Score, 추천 리드까지 리포트 재생성이 가능하도록 처리합니다.
        </p>
      </div>
      <div className="p-4">
      <Progress value={progress} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <PipelineMetric icon={FileSpreadsheet} label="처리 rows" value={`${meta.rows}개`} />
        <PipelineMetric icon={Database} label="저장 상태" value={meta.persisted ? "서버 저장" : "저장 확인 필요"} />
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
    <div className="rounded-md border border-border bg-muted/35 p-3">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function Report({
  analysis,
  meta,
  onReset,
  uploadType
}: {
  analysis: AnalysisResult;
  meta: { rows: number; qualityScore: number; persisted: boolean };
  onReset: () => void;
  uploadType: UploadTemplateType;
}) {
  const scoreRows = [
    ["영업력", analysis.health.salesPower],
    ["배송효율", analysis.health.deliveryEfficiency],
    ["CRM관리", analysis.health.crmManagement],
    ["신규영업", analysis.health.newSales],
    ["거래처 집중도", analysis.health.concentration],
    ["리스크", analysis.health.risk]
  ];
  const isSalesReport = uploadType === "sales-analysis";
  const sortedWhiteSpace = analysis.regionDistribution
    .slice()
    .sort((a, b) => b.whitespace - a.whitespace)
    .slice(0, 4);
  const actionPlan = [
    ["오늘", "A등급 거래처 주소와 사업자 상태를 먼저 보완하고, 배송 적재위치 자료를 등록합니다."],
    ["이번주", `${analysis.missingRegions.slice(0, 3).join(", ")} 지역의 신규 매장 후보를 영업 코스에 넣습니다.`],
    ["이번달", "매출 거래원장을 다시 업로드해 품목 이탈과 매출 등급 변화를 비교합니다."]
  ] as const;

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge className="mb-4 bg-blue-50 text-blue-700">MAJU AI Report</Badge>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{analysis.companyName} 회사 진단 리포트</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                {isSalesReport ? "매출 거래내역 업데이트" : "거래처 마스터 등록"} 기준 · 거래처 {analysis.customers}곳 · 거래지역 {analysis.regions}개 · 분석 완료
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-black text-white shadow-sm transition hover:bg-teal-800" href="/dashboard">
                대시보드 보기
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                href={isSalesReport ? "/revenue/transactions" : "/crm/timeline"}
              >
                {isSalesReport ? "매출 원장 보기" : "거래처 히스토리 보기"}
              </Link>
              <Button variant="outline" onClick={onReset}>데이터 다시 등록</Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ResultMetric label="처리 데이터" value={`${meta.rows.toLocaleString()}행`} />
            <ResultMetric label="저장 상태" value={meta.persisted ? "서버 저장" : "저장 확인 필요"} />
            <ResultMetric label="품질 점수" value={meta.qualityScore ? `${meta.qualityScore}%` : "확인 필요"} />
            <ResultMetric label="잠재매출" value={`월 ${analysis.potentialRevenue.toLocaleString()}만원`} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">Company Health Score</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-black text-teal-700">{analysis.health.total}</span>
                <span className="pb-2 text-sm font-black text-slate-500">점</span>
              </div>
            </div>
            <HeartPulse className="h-6 w-6 text-teal-700" />
          </div>
          <div className="mt-5 space-y-3">
            {scoreRows.map(([label, value]) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                  <span>{label as string}</span>
                  <span>{value as number}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${value as number}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="grid gap-4 lg:grid-cols-2">
          <ReportSection icon={MapPin} title="거래처 분포">
            {analysis.regionDistribution.slice(0, 6).map((item) => (
              <MetricLine key={item.region} label={item.region} value={`${item.count}곳`} hint={`잠재 ${item.potential}곳 · 공백 ${item.whitespace}곳`} />
            ))}
          </ReportSection>

          <ReportSection icon={Route} title="배송 운영">
            <div className="grid gap-3 sm:grid-cols-2">
              <ResultMetric label="평균 배송거리" value={`${analysis.avgDeliveryKm.toFixed(1)}km`} />
              <ResultMetric label="절감 가능거리" value={`${Math.max(18, Math.round(analysis.avgDeliveryKm * 2.8))}km`} />
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-500">
              물류 출발지와 배송주소를 기준으로 권역을 묶으면 같은 차량의 중복 이동을 줄일 수 있습니다.
            </p>
          </ReportSection>

          <ReportSection icon={BarChart3} title="업종 · 매출 구조">
            {analysis.industryDistribution.map((item) => (
              <MetricLine key={item.industry} label={item.industry} value={`${item.share}%`} hint={`${item.count}곳 · 매출 등급 산정 기준`} />
            ))}
          </ReportSection>

          <ReportSection icon={Target} title="White Space">
            {sortedWhiteSpace.map((item) => (
              <MetricLine key={item.region} label={item.region} value={`${item.whitespace}곳`} hint={`현재 거래처 ${item.count}곳`} />
            ))}
          </ReportSection>
        </div>

        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 제안 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.aiInsights.map((insight) => (
                <div key={insight} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
                  {insight}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                다음 액션
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionPlan.map(([period, action]) => (
                <div key={period} className="grid gap-3 rounded-md border border-slate-100 p-3 sm:grid-cols-[72px_1fr]">
                  <Badge className="h-fit justify-center bg-blue-50 text-blue-700">{period}</Badge>
                  <p className="text-sm font-semibold leading-6 text-slate-600">{action}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            추천 TOP10
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {analysis.leadRecommendations.map((lead, index) => (
            <div key={lead.name} className="grid gap-3 rounded-md border border-slate-100 bg-white p-3 sm:grid-cols-[48px_1fr_auto] sm:items-center">
              <span className="text-lg font-black text-blue-700">{index + 1}위</span>
              <div>
                <p className="font-black text-slate-950">{lead.name}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{lead.reasons.join(" · ")}</p>
              </div>
              <Badge className="justify-center bg-emerald-50 text-emerald-700">{lead.score}점</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ReportSection({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function MetricLine({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div>
        <p className="font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <span className="text-lg font-black">{value}</span>
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
  const workbookSheets = sheets.map((sheet) => ({
    data: rawRowsToSheetData(sheet.rows),
    sheet: sheet.name.slice(0, 31)
  }));

  await writeXlsxFile(workbookSheets).toFile(filename);
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

function buildCustomerExportRows(customers: CustomerRow[]): RawRow[] {
  return customers.map((customer, index) => ({
    회사명: customer.companyName,
    "거래처/매장 상호명": customer.customerName,
    사업자등록번호: `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
    대표자명: ["김민준", "이서연", "박지훈", "최하린"][index % 4],
    개업일: `201${index % 10}-0${(index % 9) + 1}-0${(index % 8) + 1}`,
    배송주소: customer.address,
    지역: customer.region,
    업종: customer.industry,
    매출등급: revenueGrade(customer.monthlyRevenue),
    월매출: customer.monthlyRevenue,
    최근주문일수: customer.lastOrderDays,
    월방문횟수: customer.visitCount,
    "기존 계산거리(km)": customer.deliveryKm,
    연락처: `010-${String(3100 + index).padStart(4, "0")}-${String(1000 + index).padStart(4, "0")}`,
    이메일: `${customer.customerName.replace(/\s/g, "").toLowerCase()}@example.com`,
    "네이버 플레이스 링크": customer.naverPlaceUrl || "",
    "카카오맵 링크": customer.kakaoPlaceUrl || "",
    "구글맵 링크": customer.googleMapUrl || ""
  }));
}

function buildSalesExportRows(customers: CustomerRow[], uploadedRows: RawRow[]): RawRow[] {
  if (uploadedRows.length) return uploadedRows;

  return customers.flatMap((customer, customerIndex) =>
    Array.from({ length: 3 }, (_, index) => ({
      "거래처/매장 상호명": customer.customerName,
      사업자등록번호: `123-${String(10 + customerIndex).padStart(2, "0")}-${String(10000 + customerIndex).padStart(5, "0")}`,
      매출일자: `2026-07-${String(index + 1).padStart(2, "0")}`,
      품목명: ["육류", "소스", "냉동식품"][index % 3],
      수량: 8 + index + customerIndex,
      매출금액: Math.round((customer.monthlyRevenue * 10000) / 3),
      지역: customer.region,
      주소: customer.address
    }))
  );
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
    email: "sample@example.com",
    birthDate: "1974-01-01",
    region: "성동구",
    industry: "한식",
    naverPlaceUrl: "https://naver.me/x0UEyxqb",
    kakaoPlaceUrl: "https://place.map.kakao.com/1386668708",
    googleMapUrl: "https://maps.app.goo.gl/Yi95hRHRViVUYoqm6",
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
  if (provider === "sample") return "샘플 엔진";
  return "대기";
}

function fieldLabelForHeader(header: string, fields: readonly UploadTemplateField[]) {
  return fields.find((field) => field.key === header)?.label || header;
}

function summarizeDataQuality(rows: RawRow[], requiredFields: readonly UploadTemplateField[], fieldMap: FieldMap): DataQualitySummary {
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
    const duplicateKey = businessNumber || [customerName, address].filter(Boolean).join("|");

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

function buildPlaceSearchLinks(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return [
    { href: `https://search.naver.com/search.naver?query=${encodedQuery}`, label: "네이버" },
    { href: `https://map.kakao.com/?q=${encodedQuery}`, label: "카카오맵" },
    { href: `https://www.google.com/maps/search/${encodedQuery}`, label: "구글맵" }
  ];
}

function buildManualCustomerPayload(row: RawRow) {
  return {
    address: String(row.address || ""),
    birthDate: String(row.birthDate || ""),
    businessNumber: String(row.businessRegistrationNumber || ""),
    businessStatus: "확인 예정",
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
    validateBusinessNumber: true,
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

function isValidBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (!/^[0-9]{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
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
