"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
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
import { Progress } from "@/components/ui/progress";
import { analyzeCompany, AnalysisResult } from "@/lib/analysis";
import { CustomerRow, sampleCustomers, UploadTemplateField, UploadTemplateType, uploadTemplates } from "@/lib/sample-data";

type RawRow = Record<string, string | number | boolean | null | undefined>;
type FieldMap = Record<string, string>;
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

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

export default function Home() {
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

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<RawRow>(firstSheet, { defval: "" });
    const nextHeaders = Object.keys(json[0] || {});

    setRawRows(json);
    setHeaders(nextHeaders);
    setFieldMap(autoMapHeaders(nextHeaders, currentTemplate.fields));
    setUploadedFilename(file.name);
    setUsingSample(false);
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
          await refreshUploadHistory();
        } else if (response?.status === 401) {
          setManualSaveMessage("저장 대기 목록에 추가했습니다. 서버 저장은 고객사 또는 관리자 로그인 후 가능합니다.");
        } else {
          setManualSaveMessage(payload?.message ? `저장 대기 목록에 추가했습니다. 서버 저장 확인: ${payload.message}` : "저장 대기 목록에 추가했습니다. 서버 저장은 나중에 다시 시도하세요.");
        }
      }
    } finally {
      setIsManualSaving(false);
      setManualDraft({});
    }
  }

  async function analyzeUploadedRows() {
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
      setPipelineMeta({
        rows: payload?.pipeline?.rows || nextRows.length,
        qualityScore: payload?.pipeline?.qualityScore || 0,
        persisted: Boolean(payload?.persisted)
      });
    }

    await completePipelineStep("report");
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
      companyName="마주식자재"
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
          href="/routes/today"
        >
          영업·배송 코스
        </Link>
      }
      subtitle="거래처 마스터와 매출 거래내역을 등록하고, 업로드 양식과 현재 데이터를 내려받습니다."
      title="데이터 등록"
      userName="정두영"
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
            onGenerateReport={generateCurrentReport}
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-black text-slate-950">{copy[0]}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{copy[1]}</p>
      </div>
      <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`h-9 rounded-md px-3 text-sm font-black transition ${active === key ? "bg-white text-blue-700 shadow-sm ring-1 ring-inset ring-slate-200" : "text-slate-500 hover:text-slate-950"}`}
            onClick={() => onMove(key)}
            type="button"
          >
            {label}
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

        <div className="rounded-md border border-slate-200 bg-slate-950 p-5 text-white">
          <p className="text-xs font-bold text-white/60">등록 후 생성되는 결과</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {reportOutcomes.map(([label, value, hint]) => (
              <div key={label} className="rounded-md border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-bold text-white/55">{label}</p>
                <p className="mt-1 text-2xl font-black text-white">{value}</p>
                <p className="mt-2 text-xs leading-5 text-white/55">{hint}</p>
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
  onGenerateReport,
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
  onGenerateReport: () => void;
  onDownloadTemplate: (type: UploadTemplateType) => void;
  onDownloadCustomerExport: () => void;
  onDownloadSalesExport: () => void;
}) {
  const [entryMode, setEntryMode] = useState<"excel" | "manual">("excel");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [savedPreset, setSavedPreset] = useState<FieldMap | null>(null);
  const [presetMessage, setPresetMessage] = useState("");
  const requiredFields = template.fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !fieldMap[field.key]);
  const complete = missingRequiredFields.length === 0;
  const isMaster = uploadType === "customer-master";
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
  const flowSteps = [
    {
      description: isMaster ? "거래처 마스터는 히스토리와 배송 코스의 기준값입니다." : "매출 거래내역은 등급, 이탈, 리포트의 기준값입니다.",
      done: Boolean(uploadType),
      label: "등록 유형",
      value: template.label
    },
    {
      description: entryMode === "excel" ? "파일을 올려 ERP 헤더를 읽고 매핑합니다." : "주소/사업자번호 검증 후 1건씩 저장합니다.",
      done: entryMode === "manual" ? manualComplete : hasDataRows,
      label: "등록 방식",
      value: entryMode === "excel" ? "엑셀 업로드" : "수기 입력"
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <DataRegistrationFlowCard steps={flowSteps} />

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div>
              <Badge className="mb-3 bg-emerald-50 text-emerald-800">1. 무엇을 등록하나요?</Badge>
              <h2 className="text-xl font-black text-slate-950">데이터 종류를 먼저 선택하세요</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">기초정보는 거래처 원장에 저장되고, 매출 거래내역은 분석과 등급 갱신에 누적됩니다.</p>
            </div>
            <Badge className="w-fit bg-slate-100 text-slate-700">{rawRows.length}개 저장 대기</Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {Object.entries(uploadTemplates).map(([key, item]) => {
              const selected = uploadType === key;
              const Icon = key === "customer-master" ? Building2 : Banknote;
              return (
                <button
                  key={key}
                  className={`rounded-md border p-4 text-left transition ${
                    selected ? "border-emerald-300 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  onClick={() => onUploadType(key as UploadTemplateType)}
                  type="button"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${selected ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-black">{item.label}</span>
                        <span className="mt-1 block text-sm font-medium leading-6 text-slate-500">{item.description}</span>
                      </span>
                    </span>
                    {selected ? <Check className="h-5 w-5 shrink-0 text-emerald-700" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="mb-3 bg-blue-50 text-blue-700">2. 어떻게 등록하나요?</Badge>
              <h2 className="text-xl font-black text-slate-950">{template.label}</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{uploadHint}</p>
            </div>
            <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                className={`h-9 rounded-md px-3 text-sm font-black ${entryMode === "excel" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => setEntryMode("excel")}
                type="button"
              >
                엑셀 업로드
              </button>
              <button
                className={`h-9 rounded-md px-3 text-sm font-black ${entryMode === "manual" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => setEntryMode("manual")}
                type="button"
              >
                수기 입력
              </button>
            </div>
          </div>

          {entryMode === "excel" ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center transition hover:bg-blue-50">
                <Upload className="mb-4 h-11 w-11 text-blue-700" />
                <span className="text-lg font-black text-slate-950">엑셀 파일을 여기에 올리세요</span>
                <span className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">ERP 양식이 달라도 괜찮습니다. 파일을 올리면 헤더를 읽고 오른쪽에서 필수 컬럼을 자동 매핑합니다.</span>
                <span className="mt-4 rounded-md bg-white px-3 py-2 text-xs font-black text-blue-700">.xlsx · .xls · .csv 지원</span>
                <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
              </label>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">빠른 시작</p>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" className="justify-start gap-2 bg-white" onClick={() => onDownloadTemplate(uploadType)}>
                    <Download size={16} />
                    현재 양식 받기
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 bg-white" onClick={uploadType === "customer-master" ? onDownloadCustomerExport : onDownloadSalesExport}>
                    <FileSpreadsheet size={16} />
                    현재 데이터 받기
                  </Button>
                  <Button variant="outline" className="justify-start gap-2 bg-white" onClick={onGenerateReport}>
                    <Sparkles size={16} />
                    현재 데이터로 리포트 생성
                  </Button>
                </div>
                <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">{saveHint}</p>
              </div>
            </div>
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
                          <Link className="inline-flex h-7 items-center justify-center rounded-md bg-slate-950 px-2.5 text-xs font-black text-white" href={lastManualCustomerHref}>
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
                  {template.fields.map((field) => {
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
              </div>

              <ManualValidationPanel
                addressSelected={manualAddressSelected}
                businessNumber={manualBusinessNumber}
                businessNumberValid={manualBusinessNumberValid}
                isMaster={isMaster}
                missingFields={manualMissingRequiredFields}
                ready={manualComplete}
              />
            </div>
          )}
        </div>

        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          <Button variant="outline" className="justify-start gap-2" onClick={() => onDownloadTemplate("customer-master")}>
            <Download size={16} />
            거래처 양식
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={() => onDownloadTemplate("sales-analysis")}>
            <Download size={16} />
            매출 양식
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={onDownloadCustomerExport}>
            <FileSpreadsheet size={16} />
            거래처 내보내기
          </Button>
          <Link
            className="inline-flex h-10 items-center justify-start gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            href={getAdminCompanyIdFromUrl() ? `/revenue/transactions?companyId=${encodeURIComponent(getAdminCompanyIdFromUrl())}` : "/revenue/transactions"}
          >
            <Banknote size={16} />
            매출 원장 보기
          </Link>
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <Badge className="mb-3 bg-violet-50 text-violet-700">3. 확인하고 저장</Badge>
            <h2 className="text-lg font-black text-slate-950">컬럼 매핑 · 저장 상태</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
              {rawRows.length ? `${rawRows.length}개 행을 확인한 뒤 리포트를 갱신합니다.` : "엑셀 업로드 또는 수기 저장 후 이곳에서 확인합니다."}
            </p>
          </div>
          <div className="p-4">
            {isAnalyzing ? (
              <PipelineStatusPanel steps={pipelineSteps} meta={pipelineMeta} />
            ) : (
              <>
                <UploadStatusCard
                  complete={complete}
                  filename={uploadedFilename}
                  headers={headers}
                  mappedRequiredCount={mappedRequiredCount}
                  mappingProgress={mappingProgress}
                  requiredCount={requiredFields.length}
                  rows={rawRows}
                />
                <DataQualityCard summary={dataQuality} onDownloadIssues={downloadIssueRows} />
                <MappingPresetCard
                  canLoad={Boolean(savedPreset)}
                  canSave={headers.length > 0 && Object.keys(fieldMap).length > 0}
                  message={presetMessage}
                  templateLabel={template.label}
                  onLoad={applySavedPreset}
                  onRemove={removeSavedPreset}
                  onSave={saveCurrentPreset}
                />
                <RecentUploadHistoryCard uploads={uploadHistory} />
                <div className="mb-4 grid gap-2">
                  {requiredFields.map((field) => {
                    const mappedHeader = fieldMap[field.key];
                    return (
                      <div key={field.key} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${mappedHeader ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                        <span className="text-sm font-black text-slate-800">{field.label}</span>
                        <span className={`text-xs font-black ${mappedHeader ? "text-emerald-700" : "text-amber-700"}`}>
                          {mappedHeader || "필수"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {headers.length ? (
                  <div className="grid max-h-[520px] gap-3 overflow-auto pr-1">
                    {template.fields.map((field) => (
                      <label key={field.key} className="space-y-1.5">
                        <span className="text-xs font-black text-slate-500">
                          {field.label}
                          {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                        </span>
                        <select
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-200"
                          value={fieldMap[field.key] || ""}
                          onChange={(event) => onMap({ ...fieldMap, [field.key]: event.target.value })}
                        >
                          <option value="">컬럼 선택</option>
                          {headers.map((header) => (
                            <option key={header} value={header}>
                              {fieldLabelForHeader(header, template.fields)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <p className="font-black text-slate-950">아직 저장 대기 데이터가 없습니다.</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">중앙에서 엑셀을 업로드하거나 수기로 입력하면 매핑 상태가 표시됩니다.</p>
                  </div>
                )}
                <div className="mt-4 rounded-md border border-slate-200 p-3">
                  <span className="flex items-center gap-2 text-sm font-black text-slate-700">
                    <Check className={canAnalyze ? "h-4 w-4 text-emerald-700" : "h-4 w-4 text-slate-400"} />
                    {canAnalyze ? "저장 준비 완료" : rawRows.length ? `${missingRequiredFields.map((field) => field.label).join(", ")} 연결이 필요합니다.` : "먼저 엑셀 업로드 또는 수기 입력을 진행하세요."}
                  </span>
                  {rawRows.length ? <DataPreview rows={rawRows} fields={template.fields} fieldMap={fieldMap} /> : null}
                  <Button className="mt-3 w-full" onClick={onAnalyze} disabled={!canAnalyze}>
                    업데이트 후 리포트 갱신
                    <ArrowRight size={18} />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </section>
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

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Badge className="mb-3 bg-slate-950 text-white">운영 등록 플로우</Badge>
          <h2 className="text-xl font-black text-slate-950">데이터가 운영 화면에 반영되는 순서</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">거래처 기본정보와 매출 거래내역은 같은 등록 흐름을 거치지만, 저장 후 쓰임이 다릅니다.</p>
        </div>
        <Badge className="w-fit bg-blue-50 text-blue-700">{completeCount}/4 완료</Badge>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.label} className={`rounded-md border p-3 ${step.done ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-sm font-black ${step.done ? "bg-emerald-700 text-white" : "bg-white text-slate-500"}`}>
                {step.done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <Badge className={step.done ? "bg-white text-emerald-700" : "bg-white text-slate-500"}>{step.done ? "완료" : "대기"}</Badge>
            </div>
            <p className="mt-3 text-sm font-black text-slate-950">{step.label}</p>
            <p className="mt-1 text-sm font-black text-blue-700">{step.value}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualValidationPanel({
  addressSelected,
  businessNumber,
  businessNumberValid,
  isMaster,
  missingFields,
  ready
}: {
  addressSelected: boolean;
  businessNumber: string;
  businessNumberValid: boolean;
  isMaster: boolean;
  missingFields: UploadTemplateField[];
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

  return (
    <aside className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
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
      <div className="mt-4 space-y-2">
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
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-500">저장 후 흐름</p>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-800">저장 대기 목록에 추가되고, 우측 저장 상태에서 서버 반영과 리포트 갱신을 진행합니다.</p>
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
    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-400">{hasRows ? "업로드됨" : "대기 중"}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{hasRows ? filename : "아직 등록할 데이터가 없습니다."}</p>
        </div>
        <Badge className={complete && hasRows ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
          {complete && hasRows ? "저장 가능" : "확인 필요"}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStatus label="행" value={`${rows.length}개`} />
        <MiniStatus label="컬럼" value={`${headers.length}개`} />
        <MiniStatus label="필수" value={`${mappedRequiredCount}/${requiredCount}`} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs font-black text-slate-500">
          <span>필수 매핑</span>
          <span>{mappingProgress}%</span>
        </div>
        <Progress value={mappingProgress} />
      </div>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
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

  return (
    <div className={`mb-4 rounded-md border p-3 ${hasIssues ? "border-amber-200 bg-amber-50/70" : "border-emerald-100 bg-emerald-50/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            {hasIssues ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : <Check className="h-4 w-4 text-emerald-700" />}
            행 데이터 품질
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            {hasRows ? "필수값 누락, 사업자번호 유효성, 중복 후보를 저장 전에 확인합니다." : "엑셀을 올리면 행 단위 검증 결과가 표시됩니다."}
          </p>
        </div>
        <Badge className={hasIssues ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{hasIssues ? "보완 권장" : "정상"}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStatus label="정상 행" value={`${summary.readyRows.toLocaleString()}개`} />
        <MiniStatus label="보완 행" value={`${rowIssueCount.toLocaleString()}개`} />
        <MiniStatus label="사업자 오류" value={`${summary.invalidBusinessNumbers.length.toLocaleString()}개`} />
        <MiniStatus label="중복 후보" value={`${summary.duplicateCandidates.toLocaleString()}개`} />
      </div>
      {summary.issueRows.length ? (
        <div className="mt-3 space-y-1.5">
          {summary.issueRows.slice(0, 3).map((issue) => (
            <div key={issue.rowNumber} className="rounded-md bg-white/80 px-3 py-2 text-xs font-bold text-slate-700">
              {issue.rowNumber}행: {issue.missingLabels.join(", ")} 누락
            </div>
          ))}
          {summary.issueRows.length > 3 ? <p className="px-1 text-xs font-bold text-amber-700">외 {summary.issueRows.length - 3}개 행 보완 필요</p> : null}
        </div>
      ) : null}
      {summary.invalidBusinessNumbers.length ? (
        <div className="mt-3 space-y-1.5">
          {summary.invalidBusinessNumbers.slice(0, 3).map((issue) => (
            <div key={`business-${issue.rowNumber}`} className="rounded-md bg-white/80 px-3 py-2 text-xs font-bold text-slate-700">
              {issue.rowNumber}행: 사업자번호 {issue.value || "빈 값"} 유효성 오류
            </div>
          ))}
          {summary.invalidBusinessNumbers.length > 3 ? <p className="px-1 text-xs font-bold text-amber-700">외 {summary.invalidBusinessNumbers.length - 3}개 사업자번호 확인 필요</p> : null}
        </div>
      ) : null}
      <Button className="mt-3 w-full bg-white" disabled={!hasRowIssues} onClick={onDownloadIssues} size="sm" variant="outline">
        <Download className="h-4 w-4" />
        보완 필요 행 다운로드
      </Button>
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
  const latestUploads = uploads.slice(0, 4);

  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <History className="h-4 w-4 text-slate-500" />
            최근 등록 이력
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">저장된 파일과 분석 품질을 바로 확인합니다.</p>
        </div>
        <Badge className="shrink-0 bg-slate-100 text-slate-600">{uploads.length}건</Badge>
      </div>

      {latestUploads.length ? (
        <div className="mt-3 space-y-2">
          {latestUploads.map((upload) => (
            <div key={upload.id} className="rounded-md border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{upload.filename}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {upload.createdAt}
                  </p>
                </div>
                <Badge className={upload.status === "completed" ? "bg-emerald-100 text-emerald-800" : upload.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                  {upload.status === "completed" ? "완료" : upload.status === "failed" ? "실패" : "진행중"}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MiniStatus label="rows" value={`${upload.rows.toLocaleString()}개`} />
                <MiniStatus label="품질" value={`${upload.qualityScore}%`} />
                <MiniStatus label="중복" value={`${upload.duplicateCount.toLocaleString()}개`} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-sm font-black text-slate-900">아직 서버 등록 이력이 없습니다.</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">엑셀 업로드 후 저장하면 이곳에 최근 이력이 표시됩니다.</p>
        </div>
      )}
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
    <div className="space-y-5 py-2">
      <div>
        <div className="flex items-center gap-3 text-lg font-black">
          <Activity className="h-6 w-6 animate-pulse text-primary" />
          데이터 적재 파이프라인 실행 중
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          원본 데이터부터 정제 데이터, Health Score, 추천 리드까지 리포트 재생성이 가능하도록 처리합니다.
        </p>
      </div>
      <Progress value={progress} />
      <div className="grid gap-3 sm:grid-cols-3">
        <PipelineMetric icon={FileSpreadsheet} label="처리 rows" value={`${meta.rows}개`} />
        <PipelineMetric icon={Database} label="저장 상태" value={meta.persisted ? "서버 저장" : "저장 확인 필요"} />
        <PipelineMetric icon={Save} label="품질 점수" value={meta.qualityScore ? `${meta.qualityScore}%` : "계산 중"} />
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.key} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[28px_1fr_auto] sm:items-center">
            <span
              className={
                step.status === "done"
                  ? "flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"
                  : step.status === "running"
                    ? "flex h-7 w-7 items-center justify-center rounded-full bg-accent text-foreground"
                    : "flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
              }
            >
              {step.status === "done" ? <Check className="h-4 w-4" /> : step.status === "running" ? <Activity className="h-4 w-4 animate-pulse" /> : null}
            </span>
            <div>
              <p className="font-black">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            <Badge className={step.status === "done" ? "bg-primary/10 text-primary" : step.status === "running" ? "bg-accent/20 text-foreground" : ""}>
              {step.status === "done" ? "완료" : step.status === "running" ? "진행 중" : "대기"}
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
              <Link className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800" href="/dashboard">
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

        <div className="rounded-md border border-slate-200 bg-slate-950 p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white/55">Company Health Score</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-black text-emerald-300">{analysis.health.total}</span>
                <span className="pb-2 text-sm font-black text-white/55">점</span>
              </div>
            </div>
            <HeartPulse className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="mt-5 space-y-3">
            {scoreRows.map(([label, value]) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-xs font-bold text-white/70">
                  <span>{label as string}</span>
                  <span>{value as number}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-300" style={{ width: `${value as number}%` }} />
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

function downloadWorkbook(filename: string, sheets: { name: string; rows: RawRow[] }[]) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });

  XLSX.writeFile(workbook, filename);
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
    이메일: `${customer.customerName.replace(/\s/g, "").toLowerCase()}@example.com`
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
    lastOrderDays: 0,
    monthlyRevenue: 0,
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
