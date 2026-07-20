import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowRight, Building2, ClipboardList, Database, FileSpreadsheet, Gauge, Settings, ShieldCheck, Target, UploadCloud, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { getAdminSession } from "@/lib/auth";
import { getAdminDashboardPayload } from "@/lib/store";
import { AdminPageHeader } from "./admin-page-header";

export default async function AdminPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const dashboard = await getAdminDashboardPayload();
  const overview = [
    ["고객사", `${dashboard.overview.companies}곳`, Database],
    ["업로드 파일", `${dashboard.overview.uploadedFiles}개`, FileSpreadsheet],
    ["처리 행 수", dashboard.overview.processedRows.toLocaleString(), ClipboardList],
    ["평균 건강도", `${dashboard.overview.avgHealthScore}점`, Gauge]
  ];

  return (
    <main className="min-h-screen bg-background">
      <AdminPageHeader active="overview" badge="MAJU Admin" session={session} subtitle="관리자 전용 운영 콘솔" title="AI Sales Intelligence 운영 콘솔" />

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          {overview.map(([label, value, Icon]) => (
            <Card key={label as string} className="shadow-none">
              <CardContent className="p-5">
                <Icon className="mb-4 h-5 w-5 text-primary" />
                <p className="text-xs font-bold text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-3xl font-black">{value as string}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  운영 시작 작업
                </CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                  어드민은 고객사 생성, 데이터 적재 확인, 고객사 미리보기 순서로 운영합니다.
                </p>
              </div>
              <Badge className="w-fit bg-slate-100 text-slate-700">권장 순서</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <AdminActionCard
              description="회사 정보와 고객사 로그인 계정을 만들고, 선택 고객사 대시보드로 진입합니다."
              href="/admin/companies"
              icon={Users}
              label="1. 고객사 관리"
            />
            <AdminActionCard
              description="거래처 마스터와 매출 거래원장이 실제 DB에 쌓였는지 확인합니다."
              href="/admin/uploads"
              icon={UploadCloud}
              label="2. 업로드 이력 확인"
            />
            <AdminActionCard
              description="관리자 기본 계정과 기본 고객사 계정 설정을 점검합니다."
              href="/admin/accounts"
              icon={ShieldCheck}
              label="3. 계정 설정"
            />
            <AdminActionCard
              description="Supabase, 지도 API, 인증 환경변수와 테이블 상태를 확인합니다."
              href="/admin/system"
              icon={Settings}
              label="4. 시스템 점검"
            />
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
              {dashboard.jobs.map((job) => (
                <div key={job.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_120px_100px] md:items-center">
                  <div>
                    <p className="font-black">{job.company}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.id} · {job.rows.toLocaleString()} rows · {job.uploadedAt}
                    </p>
                  </div>
                  <Badge className={job.status === "completed" ? "bg-primary/10 text-primary" : "bg-accent/20 text-foreground"}>
                    {job.status}
                  </Badge>
                  <div>
                    <p className="mb-1 text-xs font-bold text-muted-foreground">품질 {job.qualityScore}%</p>
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
              {dashboard.dataQuality.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex justify-between text-sm font-bold">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <Progress value={item.value} />
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
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
                Health Score 가중치
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.scoringWeights.map((weight) => (
                <div key={weight.label} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex justify-between text-sm font-black">
                    <span>{weight.label}</span>
                    <span>{weight.value}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{weight.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                리드 추천 큐
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            {dashboard.leadQueue.map((lead, index) => (
                <div key={lead.name} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[44px_1fr_90px_130px] sm:items-center">
                  <span className="text-lg font-black text-primary">{index + 1}</span>
                  <div>
                    <p className="font-bold">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.region}</p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{lead.score}점</Badge>
                  {"id" in lead ? <LeadStatusSelect leadId={String(lead.id)} value={getLeadStatusValue(lead)} /> : <Badge className="justify-center">{lead.status}</Badge>}
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
                className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted"
                href="/admin/uploads"
              >
                전체 이력 보기
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.uploadHistory.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border border-border p-4 lg:grid-cols-[1fr_130px_80px_80px_80px_110px] lg:items-center">
                <div>
                  <p className="font-black">{item.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.company} · {item.createdAt} · {item.rows.toLocaleString()} rows
                  </p>
                </div>
                <Badge className="justify-center bg-primary/10 text-primary">{item.status}</Badge>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">품질</p>
                  <p className="text-lg font-black">{item.qualityScore}%</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">중복</p>
                  <p className="text-lg font-black">{item.duplicateCount}건</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">건강도</p>
                  <p className="text-lg font-black text-primary">{item.healthScore}</p>
                </div>
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted"
                  href={`/reports/${item.reportId || "latest"}`}
                >
                  리포트 보기
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              운영 기준 API
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-4">
            {[
              ["고객사/계정", "/api/admin/companies"],
              ["거래처 원장", "/api/customers"],
              ["매출 원장", "/api/revenue/transactions"],
              ["배송 코스", "/api/routes/today"]
            ].map(([label, endpoint]) => (
              <div key={endpoint} className="rounded-md border border-border bg-muted px-3 py-2">
                <p className="text-xs font-black text-muted-foreground">{label}</p>
                <code className="mt-1 block font-bold">{endpoint}</code>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function AdminActionCard({ description, href, icon: Icon, label }: { description: string; href: string; icon: typeof Users; label: string }) {
  return (
    <Link className="group rounded-md border border-border bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-sm font-black text-slate-950">{label}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">{description}</p>
    </Link>
  );
}

function getLeadStatusValue(lead: { status: string } & Record<string, unknown>) {
  return String(lead.statusValue || lead.status);
}
