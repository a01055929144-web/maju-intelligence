"use client";

import { ChangeEvent, useMemo, useState } from "react";
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
      {screen === "briefing" && <Briefing analysis={analysis} onStart={() => setScreen("onboarding")} onSample={startSampleReport} />}
      {screen === "onboarding" && (
        <Onboarding
          headers={headers}
          fieldMap={fieldMap}
          uploadType={uploadType}
          template={currentTemplate}
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
          }}
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
            ["briefing", "AI 브리핑"],
            ["onboarding", "진단 시작"],
            ["report", "AI 리포트"]
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

function Briefing({ analysis, onStart, onSample }: { analysis: AnalysisResult; onStart: () => void; onSample: () => void }) {
  const metrics = [
    ["현재 거래처", `${analysis.customers}개`, Building2],
    ["이번주 신규 영업기회", `${analysis.newOpportunities}곳`, Target],
    ["오늘 추천", "12곳", ClipboardList],
    ["계약확률 86% 이상", `${analysis.highProbabilityCount}곳`, Sparkles],
    ["배송동선 내 신규리드", `${analysis.routeLeads}곳`, Route]
  ];

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-white p-6 shadow-panel">
          <Badge className="mb-5 bg-primary/10 text-primary">오늘의 AI 브리핑</Badge>
          <h1 className="max-w-3xl text-3xl font-black tracking-normal sm:text-5xl">
            안녕하세요 정두영님.
            <span className="block text-primary">오늘 영업은 어디서 시작할까요?</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            MAJU는 CRM 화면이 아니라 회사의 영업 데이터를 먼저 진단합니다. 샘플 데이터로도 바로 리포트 구조를 확인할 수 있습니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={onStart}>
              <Upload size={18} />
              엑셀 업로드
            </Button>
            <Button variant="accent" onClick={onSample}>
              <Sparkles size={18} />
              샘플 진단 보기
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map(([label, value, Icon]) => (
            <Card key={label as string} className="shadow-none">
              <CardContent className="p-4">
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-2xl font-black">{value as string}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>이번주 놓치고 있는 지역</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.missingRegions.map((region, index) => (
              <div key={region} className="flex items-center justify-between rounded-md border border-border p-3">
                <span className="font-bold">{index + 1}. {region}</span>
                <Badge>White Space</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Company Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <span className="text-6xl font-black text-primary">{analysis.health.total}</span>
              <span className="pb-2 text-sm font-semibold text-muted-foreground">/ 100점</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">대표가 바로 이해할 수 있도록 영업력, 배송효율, 신규영업, 리스크를 하나의 숫자로 압축합니다.</p>
          </CardContent>
        </Card>
        <Button className="w-full" size="default" onClick={onStart}>
          오늘 영업 시작
          <ArrowRight size={18} />
        </Button>
      </aside>
    </section>
  );
}

function Onboarding({
  headers,
  fieldMap,
  uploadType,
  template,
  rawRows,
  isAnalyzing,
  pipelineMeta,
  pipelineSteps,
  usingSample,
  onFile,
  onMap,
  onUploadType,
  onAnalyze,
  onSample
}: {
  headers: string[];
  fieldMap: FieldMap;
  uploadType: UploadTemplateType;
  template: { label: string; description: string; fields: readonly UploadTemplateField[] };
  rawRows: RawRow[];
  isAnalyzing: boolean;
  pipelineMeta: { rows: number; qualityScore: number; persisted: boolean };
  pipelineSteps: PipelineStep[];
  usingSample: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onMap: (map: FieldMap) => void;
  onUploadType: (type: UploadTemplateType) => void;
  onAnalyze: () => void;
  onSample: () => void;
}) {
  const complete = template.fields.filter((field) => field.required).every((field) => fieldMap[field.key]);

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader>
          <Badge className="w-fit bg-primary/10 text-primary">AI Company Diagnosis</Badge>
          <CardTitle className="text-2xl">엑셀 업로드 방식 선택</CardTitle>
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
                <span className="block font-black">{item.label}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span>
              </button>
            ))}
          </div>
          <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/45 p-6 text-center transition hover:bg-muted">
            <FileSpreadsheet className="mb-4 h-10 w-10 text-primary" />
            <span className="text-base font-black">{template.label} 엑셀 파일 선택</span>
            <span className="mt-2 text-sm text-muted-foreground">ERP마다 양식이 달라도 아래 필수 컬럼을 매핑해서 적재합니다.</span>
            <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          </label>
          <Button variant="outline" className="w-full" onClick={onSample}>
            샘플 데이터로 리포트 생성
          </Button>
          <div className="rounded-md bg-white p-4 text-sm text-muted-foreground">
            <p className="font-bold text-foreground">v1 저장 방식</p>
            <p className="mt-1 leading-6">거래처 기본정보는 회사 마스터로 유지하고, 새 엑셀은 기존 거래처 업데이트와 신규 거래처 추가에 사용합니다.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{template.label} 필수 컬럼 매핑</CardTitle>
          <p className="text-sm text-muted-foreground">{rawRows.length ? `${rawRows.length}개 행을 불러왔습니다.` : "파일을 올리면 자동 매핑을 먼저 시도합니다."}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAnalyzing ? (
            <PipelineStatusPanel steps={pipelineSteps} meta={pipelineMeta} />
          ) : (
            <>
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
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Check className={complete || usingSample ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                  {complete ? "필수 컬럼 매핑 완료" : "필수 컬럼을 매핑하면 누적 데이터에 업데이트합니다."}
                </span>
                <Button onClick={onAnalyze} disabled={!complete && !usingSample}>
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
    deliveryKm: 0
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
      region: string;
      visits: number;
    }
  >();

  rows.forEach((row) => {
    const customerName = getCell(row, fieldMap.customerName);
    if (!customerName) return;

    const current = grouped.get(customerName) || {
      address: getCell(row, fieldMap.address),
      amount: 0,
      industry: getCell(row, fieldMap.productName) || "미분류",
      lastDate: null,
      region: getCell(row, fieldMap.region) || extractRegion(getCell(row, fieldMap.address)),
      visits: 0
    };
    const nextDate = parseExcelDate(row[fieldMap.salesDate || ""]);

    current.amount += toNumber(row[fieldMap.salesAmount || ""]);
    current.visits += 1;
    if (nextDate && (!current.lastDate || nextDate > current.lastDate)) current.lastDate = nextDate;
    if (!current.address) current.address = getCell(row, fieldMap.address);
    if (!current.region) current.region = getCell(row, fieldMap.region) || extractRegion(current.address);
    grouped.set(customerName, current);
  });

  return Array.from(grouped.entries()).map(([customerName, row]) => ({
    companyName: "마주식자재",
    customerName,
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
