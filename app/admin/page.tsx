import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Database, FileSpreadsheet, Gauge, Inbox, Settings, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { getAdminSession } from "@/lib/auth";
import { getAdminDashboardPayload } from "@/lib/store";
import { AdminPageHeader } from "./admin-page-header";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const dashboard = await getAdminDashboardPayload();
  const overview = [
    ["고객사", `${dashboard.overview.companies}곳`, Database],
    ["업로드 파일", `${dashboard.overview.uploadedFiles}개`, FileSpreadsheet],
    ["처리 행 수", dashboard.overview.processedRows.toLocaleString(), ClipboardList],
    ["평균 건강도", `${dashboard.overview.avgHealthScore}점`, Gauge]
  ];
  const adminSignals = [
    {
      description: "고객사별 로그인 계정과 미리보기 진입을 관리합니다.",
      href: "/admin/companies",
      label: "고객사 운영",
      ready: dashboard.overview.companies > 0,
      value: `${dashboard.overview.companies}곳`
    },
    {
      description: "거래처 마스터와 매출 거래원장 업로드 반영 상태를 확인합니다.",
      href: "/admin/uploads",
      label: "데이터 적재",
      ready: dashboard.overview.uploadedFiles > 0,
      value: `${dashboard.overview.uploadedFiles}개`
    },
    {
      description: "Supabase, Storage, 지도·경로 API 환경을 점검합니다.",
      href: "/admin/system",
      label: "시스템 상태",
      ready: dashboard.source === "supabase",
      value: dashboard.source === "supabase" ? "연결됨" : "확인 필요"
    }
  ];
  const uploadIssues = dashboard.uploadHistory.filter(
    (item) => item.status === "failed" || item.qualityScore < 80 || item.duplicateCount > 0 || !item.reportId
  );
  const activeJobs = dashboard.jobs.filter((job) => job.status !== "completed");
  const operations = [
    {
      count: uploadIssues.length,
      description: uploadIssues.length ? "실패·품질 저하·중복·리포트 미생성 건을 확인하세요." : "보완이 필요한 업로드가 없습니다.",
      href: "/admin/uploads",
      label: "업로드 보완",
      tone: uploadIssues.length ? "warning" : "normal"
    },
    {
      count: activeJobs.length,
      description: activeJobs.length ? "처리 중인 분석의 완료 여부와 품질 점수를 확인하세요." : "대기 중인 분석 작업이 없습니다.",
      href: "/admin/uploads",
      label: "분석 진행",
      tone: activeJobs.length ? "info" : "normal"
    },
    {
      count: dashboard.leadQueue.length,
      description: dashboard.leadQueue.length ? "점수가 높은 추천 리드부터 담당 상태를 정리하세요." : "분석 완료 후 추천 리드가 생성됩니다.",
      href: "#lead-queue",
      label: "리드 후속 조치",
      tone: dashboard.leadQueue.length ? "info" : "normal"
    }
  ] as const;

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="overview" badge="MAJU Admin" session={session} subtitle="관리자 전용 운영 콘솔" title="AI Sales Intelligence 운영 콘솔" />

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-4">
        <Card className="overflow-hidden border-slate-200 shadow-none">
          <CardHeader className="border-b border-slate-200 bg-slate-50/70 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">오늘의 운영 큐</p>
                <CardTitle className="mt-1 text-xl">이상 상태부터 처리하세요</CardTitle>
              </div>
              <Badge className={uploadIssues.length || activeJobs.length ? "w-fit bg-amber-100 text-amber-800" : "w-fit bg-emerald-100 text-emerald-800"}>
                {uploadIssues.length || activeJobs.length ? `${uploadIssues.length + activeJobs.length}건 확인 필요` : "운영 정상"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-0 p-0 lg:grid-cols-3">
            {operations.map((item) => (
              <Link key={item.label} className="group flex min-h-32 items-start gap-3 border-b border-slate-200 p-4 last:border-b-0 hover:bg-slate-50 lg:border-b-0 lg:border-r lg:last:border-r-0" href={item.href}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.tone === "warning" ? "bg-amber-100 text-amber-800" : item.tone === "info" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {item.tone === "warning" ? <AlertTriangle className="h-4 w-4" /> : item.tone === "normal" ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-950">{item.label}</span>
                    <span className="text-lg font-black text-slate-950">{item.count}건</span>
                  </span>
                  <span className="mt-2 block text-sm font-medium leading-5 text-muted-foreground">{item.description}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-primary">바로 확인 <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          {overview.map(([label, value, Icon]) => (
            <Card key={label as string} className="shadow-none">
              <CardContent className="p-4">
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-medium text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{value as string}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              운영 상태
            </CardTitle>
            <p className="text-sm text-muted-foreground">확인이 필요한 항목을 먼저 점검하세요.</p>
          </CardHeader>
          <CardContent className="grid gap-2 lg:grid-cols-3">
            {adminSignals.map((signal) => (
              <AdminSignalRow key={signal.label} {...signal} />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                분석 작업
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.jobs.length === 0 ? (
                <AdminEmptyState description="업로드가 완료되면 분석 진행 상태와 품질 점수가 여기에 표시됩니다." href="/admin/uploads" label="진행 중인 분석 작업이 없습니다" linkLabel="업로드 이력 확인" />
              ) : dashboard.jobs.map((job) => (
                <div key={job.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_120px_100px] md:items-center">
                  <div>
                    <p className="font-semibold">{job.company}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {job.id} · {job.rows.toLocaleString()} rows · {job.uploadedAt}
                    </p>
                  </div>
                  <Badge className={job.status === "completed" ? "bg-primary/10 text-primary" : "bg-accent/20 text-foreground"}>
                    {job.status}
                  </Badge>
                  <div>
                    <p className="mb-1 text-sm font-medium text-muted-foreground">품질 {job.qualityScore}%</p>
                    <Progress value={job.qualityScore} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                데이터 품질
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboard.dataQuality.length === 0 ? (
                <AdminEmptyState description="분석 결과가 생성되면 필수값과 중복 데이터 품질을 확인할 수 있습니다." label="품질 데이터가 아직 없습니다" />
              ) : dashboard.dataQuality.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex justify-between text-sm font-medium">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <Progress value={item.value} />
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                회사 건강도 가중치
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.scoringWeights.map((weight) => (
                <div key={weight.label} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex justify-between text-sm font-medium">
                    <span>{weight.label}</span>
                    <span>{weight.value}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{weight.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="lead-queue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                리드 추천 큐
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            {dashboard.leadQueue.length === 0 ? (
              <AdminEmptyState description="분석을 완료하면 우선 연락할 거래처가 점수순으로 표시됩니다." label="추천 리드가 아직 없습니다" />
            ) : dashboard.leadQueue.map((lead, index) => (
                <div key={lead.name} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[44px_1fr_90px_130px] sm:items-center">
                  <span className="text-lg font-black text-primary">{index + 1}</span>
                  <div>
                    <p className="font-semibold">{lead.name}</p>
                    <p className="text-sm text-muted-foreground">{lead.region}</p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{lead.score}점</Badge>
                  <LeadStatusSelect companyId={lead.companyId} leadId={lead.id} value={getLeadStatusValue(lead)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                업로드/분석 이력
              </CardTitle>
              <Link
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted"
                href="/admin/uploads"
              >
                전체 이력 보기
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.uploadHistory.length === 0 ? (
              <AdminEmptyState description="거래처 마스터나 매출 원장을 업로드하면 처리 결과가 이곳에 쌓입니다." href="/admin/uploads" label="업로드 이력이 없습니다" linkLabel="업로드 화면으로 이동" />
            ) : dashboard.uploadHistory.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border border-border p-4 lg:grid-cols-[1fr_130px_80px_80px_80px_110px] lg:items-center">
                <div>
                  <p className="font-semibold">{item.filename}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.company} · {item.createdAt} · {item.rows.toLocaleString()} rows
                  </p>
                </div>
                <Badge className="justify-center bg-primary/10 text-primary">{item.status}</Badge>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">품질</p>
                  <p className="text-lg font-semibold">{item.qualityScore}%</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">중복</p>
                  <p className="text-lg font-semibold">{item.duplicateCount}건</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">건강도</p>
                  <p className="text-lg font-semibold text-primary">{item.healthScore}</p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted"
                  href={`/reports/${item.reportId || "latest"}`}
                >
                  리포트 보기
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

      </section>
    </main>
  );
}

function AdminSignalRow({
  description,
  href,
  label,
  ready,
  value
}: {
  description: string;
  href: string;
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <Link className={`group flex items-center gap-3 rounded-md border p-3 transition ${ready ? "border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50" : "border-amber-200 bg-amber-50/70 hover:bg-amber-50"}`} href={href}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-950">{label}</p>
          <span className="text-sm text-slate-500">{value}</span>
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge className={ready ? "bg-white text-emerald-800 ring-1 ring-inset ring-emerald-100" : "bg-white text-amber-800 ring-1 ring-inset ring-amber-100"}>
          {ready ? "정상" : "확인"}
        </Badge>
        <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function AdminEmptyState({ description, href, label, linkLabel }: { description: string; href?: string; label: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center">
      <Inbox className="h-6 w-6 text-slate-400" />
      <p className="mt-3 font-semibold text-slate-900">{label}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {href && linkLabel ? (
        <Link className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100" href={href}>
          {linkLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function getLeadStatusValue(lead: { status: string } & Record<string, unknown>) {
  return String(lead.statusValue || lead.status);
}
