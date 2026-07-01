"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  Database,
  FileSpreadsheet,
  HeartPulse,
  MapPin,
  Save,
  Route,
  Sparkles,
  Target,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const emptyMap: FieldMap = {};
const initialPipelineSteps: PipelineStep[] = [
  { key: "file", label: "파일 수신", description: "엑셀 파일과 시트 정보를 확인합니다.", status: "pending" },
  { key: "mapping", label: "컬럼 매핑", description: "필수 컬럼과 업로드 컬럼을 연결합니다.", status: "pending" },
  { key: "raw", label: "Raw 데이터 적재", description: "원본 행 데이터를 재분석 가능하게 보존합니다.", status: "pending" },
  { key: "normalize", label: "거래처 정제", description: "거래처명, 주소, 업종, 매출 정보를 표준화합니다.", status: "pending" },
  { key: "score", label: "Health Score 계산", description: "영업력, 배송효율, 리스크 점수를 계산합니다.", status: "pending" },
  { key: "report", label: "AI 리포트 생성", description: "대표가 볼 진단 리포트와 추천 리드를 생성합니다.", status: "pending" }
];

export default function Home() {
  const [screen, setScreen] = useState<"briefing" | "onboarding" | "report">("briefing");
  const [uploadType, setUploadType] = useState<UploadTemplateType>("customer-master");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [manualDraft, setManualDraft] = useState<RawRow>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<FieldMap>(emptyMap);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [usingSample, setUsingSample] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>(sampleCustomers);
  const [uploadedFilename, setUploadedFilename] = useState<string>("sample-customers.xlsx");
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(initialPipelineSteps);
  const [pipelineMeta, setPipelineMeta] = useState({ rows: sampleCustomers.length, qualityScore: 100, persisted: false });

  const analysis = useMemo(() => analyzeCompany(customers), [customers]);
  const currentTemplate = uploadTemplates[uploadType];

  function startUploadFlow(nextType: UploadTemplateType) {
    setUploadType(nextType);
    setFieldMap(autoMapHeaders(headers, uploadTemplates[nextType].fields));
    setScreen("onboarding");
  }

  function startSampleReport() {
    setUsingSample(true);
    setCustomers(sampleCustomers);
    runPipeline(sampleCustomers, [], {}, "sample-customers.xlsx");
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

  function saveManualEntry() {
    const nextHeaders = currentTemplate.fields.map((field) => field.key);
    const nextRow = currentTemplate.fields.reduce<RawRow>((row, field) => {
      row[field.key] = manualDraft[field.key] ?? "";
      return row;
    }, {});
    const nextRows = [...rawRows, nextRow];

    setRawRows(nextRows);
    setHeaders(nextHeaders);
    setFieldMap(createIdentityFieldMap(currentTemplate.fields));
    setUploadedFilename(`${currentTemplate.label}-manual`);
    setUsingSample(false);
    setManualDraft({});
  }

  async function analyzeUploadedRows() {
    const mapped = uploadType === "sales-analysis" ? mapSalesRowsToCustomers(rawRows, fieldMap) : mapMasterRowsToCustomers(rawRows, fieldMap);

    const nextRows = mapped.length ? mapped : sampleCustomers;
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
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setScreen("report");
    }, 450);
  }

  async function completePipelineStep(key: string) {
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "running" } : step)));
    await wait(230);
    setPipelineSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: "done" } : step)));
    await wait(120);
  }

  return (
    <main className="min-h-screen">
      <TopNav active={screen} onMove={setScreen} />
      {screen === "briefing" && <Briefing analysis={analysis} onStart={startUploadFlow} onSample={startSampleReport} />}
      {screen === "onboarding" && (
        <Onboarding
          headers={headers}
          fieldMap={fieldMap}
          uploadType={uploadType}
          template={currentTemplate}
          manualDraft={manualDraft}
          rawRows={rawRows}
          isAnalyzing={isAnalyzing}
          pipelineMeta={pipelineMeta}
          pipelineSteps={pipelineSteps}
          usingSample={usingSample}
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
          onSample={startSampleReport}
        />
      )}
      {screen === "report" && <Report analysis={analysis} onReset={() => setScreen("onboarding")} />}
    </main>
  );
}

function TopNav({ active, onMove }: { active: string; onMove: (screen: "briefing" | "onboarding" | "report") => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <button className="flex items-center gap-2 text-left" onClick={() => onMove("briefing")}>
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-black text-white">M</span>
          <span>
            <span className="block text-sm font-black">MAJU Intelligence v1</span>
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
  onSample
}: {
  analysis: AnalysisResult;
  onStart: (type: UploadTemplateType) => void;
  onSample: () => void;
}) {
  const metrics = [
    ["관리 거래처", `${analysis.customers}개`, "사업자 정보 기반 마스터"],
    ["동선 내 기회", `${analysis.routeLeads}곳`, "배송권역 기준 신규 매장"],
    ["이번주 발굴", `${analysis.newOpportunities}곳`, "White Space 후보"],
    ["고확률 리드", `${analysis.highProbabilityCount}곳`, "우선 방문 대상"]
  ];
  const pillars = [
    ["거래처 히스토리", "사업자등록번호, 대표자, 주소, 상태 변경, 방문 이력을 한 거래처 카드에 누적합니다.", Building2],
    ["운영 동선 최적화", "회사 물류 출발지에서 거래처 배송주소까지 거리와 이동시간을 기록하고 권역을 관리합니다.", Route],
    ["신규 매장 발굴", "현재 잘 팔리는 업종과 지역 패턴을 기준으로 공략 가능한 신규 매장을 추천합니다.", Target]
  ] as const;
  const routeRows = [
    ["하남 물류센터", "성수 온반", "24.3km", "42분"],
    ["하남 물류센터", "송파 고깃집", "18.8km", "31분"],
    ["하남 물류센터", "위례 반찬", "12.4km", "24분"]
  ] as const;
  const historyRows = ["사업자 상태 정상 확인", "배송주소 변경 기록", "6월 매출 18% 증가", "방문 메모 3건 누적"];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_430px] lg:items-stretch">
        <div className="rounded-lg border border-border bg-white p-6 shadow-panel sm:p-8">
          <Badge className="mb-5 bg-primary/10 text-primary">AI Sales Intelligence Platform</Badge>
          <h1 className="max-w-4xl text-3xl font-black leading-tight tracking-normal sm:text-5xl">
            거래처 히스토리부터
            <span className="block text-primary">동선 최적화와 신규 매장 발굴까지</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
            MAJU는 엑셀 업로드 도구가 아니라 식자재 유통사의 영업 데이터를 운영 자산으로 바꾸는 플랫폼입니다.
            사업자등록 기반 거래처 관리, 물류 출발지 기준 동선 기록, 신규 매장 추천을 하나의 흐름으로 연결합니다.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90" href="/dashboard/login">
              고객사 대시보드 보기
              <ArrowRight size={18} />
            </Link>
            <Button variant="outline" onClick={() => onStart("customer-master")}>
              <Building2 size={18} />
              거래처 등록 체험
            </Button>
            <Button variant="accent" onClick={onSample}>
              <Sparkles size={18} />
              샘플 진단 보기
            </Button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value, hint]) => (
              <div key={label} className="rounded-md border border-border bg-muted/35 p-4">
                <p className="text-xs font-bold text-muted-foreground">{label}</p>
                <p className="mt-1 text-3xl font-black">{value}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-foreground p-5 text-white shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-white/60">Company Health Score</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-7xl font-black text-accent">{analysis.health.total}</span>
                <span className="pb-3 text-sm font-bold text-white/60">/ 100</span>
              </div>
            </div>
            <Badge className="bg-white/10 text-white">진단 완료</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["영업력", analysis.health.salesPower],
              ["배송효율", analysis.health.deliveryEfficiency],
              ["신규영업", analysis.health.newSales],
              ["리스크", analysis.health.risk]
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-xs font-bold text-white/70">
                  <span>{label as string}</span>
                  <span>{value as number}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${value as number}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-white/70">
            대표가 보고 싶은 것은 기능 목록이 아니라 회사 상태입니다. MAJU는 거래처, 동선, 신규영업을 숫자로 압축합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {pillars.map(([title, description, Icon]) => (
          <Card key={title} className="shadow-none">
            <CardContent className="p-5">
              <Icon className="mb-4 h-6 w-6 text-primary" />
              <p className="text-lg font-black">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              거래처 카드 예시
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-muted/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-black">성수 온반</p>
                  <p className="mt-1 text-sm text-muted-foreground">사업자등록번호 123-45-67890 · 한식 · 정상</p>
                </div>
                <Badge className="bg-primary/10 text-primary">거래중</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniFact label="대표자" value="김성수" />
                <MiniFact label="배송주소" value="서울 성동구" />
                <MiniFact label="월매출" value="420만원" />
              </div>
            </div>
            <div className="space-y-2">
              {historyRows.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              운영 동선과 신규 매장
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-white p-4">
              <p className="text-sm font-black">물류 출발지: 경기도 하남시 초이로 133 1층</p>
              <div className="mt-3 space-y-2">
                {routeRows.map(([origin, destination, distance, minutes]) => (
                  <div key={destination} className="grid gap-2 rounded-md bg-muted/35 p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span className="font-semibold">{origin}에서 {destination}까지</span>
                    <Badge>{distance}</Badge>
                    <Badge className="bg-accent/20 text-foreground">{minutes}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {analysis.missingRegions.slice(0, 3).map((region, index) => (
                <div key={region} className="rounded-md border border-border p-4">
                  <p className="text-xs font-bold text-muted-foreground">White Space {index + 1}</p>
                  <p className="mt-1 text-lg font-black">{region}</p>
                  <p className="mt-2 text-xs text-muted-foreground">신규 매장 우선 발굴 지역</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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

function Onboarding({
  headers,
  fieldMap,
  uploadType,
  template,
  manualDraft,
  rawRows,
  isAnalyzing,
  pipelineMeta,
  pipelineSteps,
  usingSample,
  onFile,
  onMap,
  onUploadType,
  onManualChange,
  onManualSave,
  onAnalyze,
  onSample
}: {
  headers: string[];
  fieldMap: FieldMap;
  uploadType: UploadTemplateType;
  template: { label: string; description: string; fields: readonly UploadTemplateField[] };
  manualDraft: RawRow;
  rawRows: RawRow[];
  isAnalyzing: boolean;
  pipelineMeta: { rows: number; qualityScore: number; persisted: boolean };
  pipelineSteps: PipelineStep[];
  usingSample: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onMap: (map: FieldMap) => void;
  onUploadType: (type: UploadTemplateType) => void;
  onManualChange: (draft: RawRow) => void;
  onManualSave: () => void;
  onAnalyze: () => void;
  onSample: () => void;
}) {
  const complete = template.fields.filter((field) => field.required).every((field) => fieldMap[field.key]);
  const manualComplete = template.fields.filter((field) => field.required).every((field) => String(manualDraft[field.key] ?? "").trim());
  const isMaster = uploadType === "customer-master";
  const uploadHint = isMaster
    ? "사업자 정보, 배송주소, 대표자, 연락처를 회사의 거래처 마스터로 저장합니다."
    : "거래처 key와 매출 행을 누적해 일/월/분기/반기/연 분석과 이탈 징후를 갱신합니다.";
  const saveHint = isMaster
    ? "기초값은 고정 보존하고, 새 엑셀은 기존 거래처 수정과 신규 거래처 등록으로 반영합니다."
    : "매출 엑셀은 거래내역으로 누적 저장하고, 같은 거래처는 매출 추이와 품목 변화를 다시 계산합니다.";

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader>
          <Badge className="w-fit bg-primary/10 text-primary">AI Company Diagnosis</Badge>
          <CardTitle className="text-2xl">데이터 등록 방식 선택</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            수기로 하나씩 저장하거나 엑셀로 대량 등록할 수 있습니다. 엑셀 업로드는 등록 방법 중 하나입니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {Object.entries(uploadTemplates).map(([key, item]) => (
              <button
                key={key}
                className={
                  uploadType === key
                    ? "rounded-lg border border-primary bg-primary/5 p-4 text-left"
                    : "rounded-lg border border-border bg-white p-4 text-left transition hover:bg-muted/50"
                }
                onClick={() => onUploadType(key as UploadTemplateType)}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-black">{item.label}</span>
                  <Badge>{key === "customer-master" ? "기초 등록" : "업데이트"}</Badge>
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span>
              </button>
            ))}
          </div>
          <div className="rounded-md border border-border bg-white p-4 text-sm leading-6 text-muted-foreground">
            <p className="font-bold text-foreground">{template.label}에서 하는 일</p>
            <p className="mt-1">{uploadHint}</p>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black">수기 입력</p>
                <p className="mt-1 text-sm text-muted-foreground">소량 등록이나 수정은 화면에서 바로 입력해 저장합니다.</p>
              </div>
              <Badge>{rawRows.length}개 대기</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {template.fields.map((field) => (
                <label key={field.key} className="space-y-1.5">
                  <span className="text-xs font-bold text-muted-foreground">
                    {field.label}
                    {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                  </span>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    inputMode={manualInputMode(field.key)}
                    type={manualInputType(field.key)}
                    value={String(manualDraft[field.key] ?? "")}
                    onChange={(event) => onManualChange({ ...manualDraft, [field.key]: event.target.value })}
                    placeholder={field.description || `${field.label} 입력`}
                  />
                </label>
              ))}
            </div>
            <Button className="mt-4 w-full" onClick={onManualSave} disabled={!manualComplete}>
              <Save size={18} />
              수기 입력 저장
            </Button>
          </div>
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/45 p-6 text-center transition hover:bg-muted">
            <FileSpreadsheet className="mb-4 h-10 w-10 text-primary" />
            <span className="text-base font-black">{template.label} 대량 엑셀 등록</span>
            <span className="mt-2 text-sm text-muted-foreground">대량 등록이 필요할 때 엑셀을 올리고, ERP별 다른 헤더는 오른쪽에서 매핑합니다.</span>
            <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          </label>
          <Button variant="outline" className="w-full" onClick={onSample}>
            샘플 데이터로 리포트 생성
          </Button>
          <div className="rounded-md bg-white p-4 text-sm text-muted-foreground">
            <p className="font-bold text-foreground">v1 저장 방식</p>
            <p className="mt-1 leading-6">{saveHint}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{template.label} 저장 대기 데이터</CardTitle>
          <p className="text-sm text-muted-foreground">
            {rawRows.length ? `${rawRows.length}개 행이 저장 대기 중입니다.` : "수기 입력 또는 엑셀 업로드 후 저장할 데이터를 확인합니다."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAnalyzing ? (
            <PipelineStatusPanel steps={pipelineSteps} meta={pipelineMeta} />
          ) : (
            <>
              {headers.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {template.fields.map((field) => (
                    <label key={field.key} className="space-y-1.5">
                      <span className="text-xs font-bold text-muted-foreground">
                        {field.label}
                        {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                      </span>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                <div className="rounded-md border border-dashed border-border bg-muted/35 p-6 text-center">
                  <p className="font-black">아직 저장 대기 데이터가 없습니다.</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">왼쪽에서 수기로 입력해 저장하거나, 엑셀을 올리면 이곳에서 저장 전 데이터를 확인합니다.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Check className={complete || usingSample ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                  {complete ? "저장 준비 완료" : `${template.label} 데이터를 입력하거나 필수 컬럼을 연결하면 저장/업데이트할 수 있습니다.`}
                </span>
                <Button onClick={onAnalyze} disabled={rawRows.length === 0 && !usingSample}>
                  업데이트 후 리포트 갱신
                  <ArrowRight size={18} />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
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
        <PipelineMetric icon={Database} label="저장소" value={meta.persisted ? "Supabase" : "Local"} />
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

function Report({ analysis, onReset }: { analysis: AnalysisResult; onReset: () => void }) {
  const scoreRows = [
    ["영업력", analysis.health.salesPower],
    ["배송효율", analysis.health.deliveryEfficiency],
    ["CRM관리", analysis.health.crmManagement],
    ["신규영업", analysis.health.newSales],
    ["거래처 집중도", analysis.health.concentration],
    ["리스크", analysis.health.risk]
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-white p-6 shadow-panel md:flex-row md:items-end">
        <div>
          <Badge className="mb-4 bg-primary/10 text-primary">MAJU AI Report</Badge>
          <h1 className="text-3xl font-black sm:text-4xl">{analysis.companyName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">거래처 {analysis.customers}개 · 거래지역 {analysis.regions}개 · 분석 완료</p>
        </div>
        <Button variant="outline" onClick={onReset}>새 엑셀 업로드</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-primary" />
              Company Health Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-end gap-3">
              <span className="text-7xl font-black text-primary">{analysis.health.total}</span>
              <span className="pb-3 text-sm font-bold text-muted-foreground">점</span>
            </div>
            <div className="space-y-4">
              {scoreRows.map(([label, value]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-sm font-bold">
                    <span>{label as string}</span>
                    <span>{value as number}</span>
                  </div>
                  <Progress value={value as number} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 제안
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {analysis.aiInsights.map((insight) => (
              <div key={insight} className="rounded-md border border-border bg-muted/35 p-4 text-sm leading-6">
                {insight}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ReportSection icon={MapPin} title="거래처 분포">
          {analysis.regionDistribution.slice(0, 6).map((item) => (
            <MetricLine key={item.region} label={item.region} value={`${item.count}개`} hint={`잠재 ${item.potential}곳`} />
          ))}
        </ReportSection>

        <ReportSection icon={Route} title="배송 효율">
          <BigNumber value={`${analysis.avgDeliveryKm.toFixed(1)}km`} label="현재 평균 배송거리" />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">AI: 반경 최적화 시 하루 {Math.max(18, Math.round(analysis.avgDeliveryKm * 2.8))}km 절감 가능합니다.</p>
        </ReportSection>

        <ReportSection icon={Target} title="신규 리드">
          <BigNumber value={`${analysis.newOpportunities}곳`} label="영업 가능한 신규 리드" />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">현재 거래처 반경과 지역 텍스트를 기준으로 v1 추천 풀을 계산했습니다.</p>
        </ReportSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <ReportSection icon={BarChart3} title="업종 분석">
          {analysis.industryDistribution.map((item) => (
            <MetricLine key={item.industry} label={item.industry} value={`${item.share}%`} hint={`${item.count}개`} />
          ))}
        </ReportSection>

        <ReportSection icon={ClipboardList} title="추천 TOP10">
          <div className="space-y-3">
            {analysis.leadRecommendations.map((lead, index) => (
              <div key={lead.name} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[48px_1fr_auto] sm:items-center">
                <span className="text-lg font-black text-primary">{index + 1}위</span>
                <div>
                  <p className="font-bold">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.reasons.join(" · ")}</p>
                </div>
                <Badge className="justify-center bg-accent/20 text-foreground">{lead.score}점</Badge>
              </div>
            ))}
          </div>
        </ReportSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ReportSection icon={MapPin} title="White Space">
          {analysis.regionDistribution
            .slice()
            .sort((a, b) => b.whitespace - a.whitespace)
            .slice(0, 4)
            .map((item) => (
              <MetricLine key={item.region} label={item.region} value={`${item.whitespace}곳`} hint={`현재 ${item.count}곳`} />
            ))}
        </ReportSection>
        <ReportSection icon={Activity} title="잠재매출">
          <BigNumber value={`월 ${analysis.potentialRevenue.toLocaleString()}만원`} label="예상 추가매출" />
          <p className="mt-4 text-xs text-muted-foreground">(가정값) 리드 수와 업종 적합도를 단순 가중했습니다.</p>
        </ReportSection>
        <ReportSection icon={Route} title="오늘 동선">
          <BigNumber value="8곳 방문" label="우선 방문 계획" />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">v2에서 티맵/카카오맵 연동 전까지는 지역 묶음 기준으로 방문 순서를 제안합니다.</p>
        </ReportSection>
      </div>
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

function fieldLabelForHeader(header: string, fields: readonly UploadTemplateField[]) {
  return fields.find((field) => field.key === header)?.label || header;
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
