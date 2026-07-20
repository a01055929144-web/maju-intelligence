import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, KeyRound, LayoutDashboard, ServerCog, ShieldAlert, UploadCloud, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminSession } from "@/lib/auth";
import { getSystemDiagnostics } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";

const statusLabels = {
  ready: "준비됨",
  fallback: "점검 필요",
  missing: "누락"
};

export default async function AdminSystemPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const system = await getSystemDiagnostics();
  const priorityActions = [
    {
      description: system.mode === "production-db" ? "실 DB 연결 상태입니다. 테이블 카운트와 Storage만 확인하면 됩니다." : "Supabase 환경변수와 schema.sql 적용 여부를 먼저 확인해야 합니다.",
      href: "#database-checks",
      icon: Database,
      label: "1. DB 연결 확인",
      tone: system.mode === "production-db" ? "ready" : "warning"
    },
    {
      description: system.adminConfigured && system.customerConfigured ? "운영 계정이 설정되어 있습니다. 고객사별 계정 분리만 확인하세요." : "관리자/고객사 기본 계정이 남아 있으면 운영값으로 바꾸세요.",
      href: "/admin/accounts",
      icon: KeyRound,
      label: "2. 계정 설정 점검",
      tone: system.adminConfigured && system.customerConfigured ? "ready" : "warning"
    },
    {
      description: "고객사별 거래처 마스터와 매출 거래원장 업로드 이력을 확인합니다.",
      href: "/admin/uploads",
      icon: UploadCloud,
      label: "3. 업로드 검증",
      tone: "default"
    },
    {
      description: "고객사 데이터가 분리되어 보이는지 관리자 미리보기로 최종 확인합니다.",
      href: "/admin/companies",
      icon: LayoutDashboard,
      label: "4. 고객사 미리보기",
      tone: "default"
    }
  ] as const;

  return (
    <main className="min-h-screen bg-background">
      <AdminPageHeader active="system" badge="System Check" session={session} subtitle="실서버 배포 전 DB, 인증, 환경변수 상태를 확인합니다" title="운영 설정 점검" />

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Card className={system.readyForOperations ? "border-primary/20 bg-primary/5" : "border-amber-200 bg-amber-50/70"}>
          <CardContent className="p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <Badge className={system.readyForOperations ? "mb-3 bg-primary text-primary-foreground" : "mb-3 bg-amber-100 text-amber-900"}>
                  {system.readyForOperations ? "운영 가능" : "조치 필요"}
                </Badge>
                <h2 className="text-2xl font-black">운영 준비 상태</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  관리자, 고객사, DB 저장, 첨부자료, 경로 계산에 필요한 설정을 기준으로 실제 운영 가능 여부를 점검합니다.
                </p>
              </div>
              <div className="w-full rounded-md border border-border bg-white p-4 lg:w-72">
                <div className="mb-3 flex items-end justify-between">
                  <p className="text-sm font-bold text-muted-foreground">준비도</p>
                  <p className="text-3xl font-black">{system.readinessScore}%</p>
                </div>
                <Progress value={system.readinessScore} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ReadinessList
                empty="필수 운영 항목이 준비되었습니다."
                icon="danger"
                items={system.blockingIssues}
                title="필수 조치"
              />
              <ReadinessList
                empty="권장 점검 항목이 없습니다."
                icon="warning"
                items={system.warningIssues}
                title="권장 점검"
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-black text-white shadow-sm transition hover:bg-teal-800" href="/admin/companies">
                <Users className="h-4 w-4" />
                고객사 데이터 확인
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-muted" href="/admin/uploads">
                <UploadCloud className="h-4 w-4" />
                업로드 이력 확인
              </Link>
              <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-muted" href="/admin/accounts">
                <KeyRound className="h-4 w-4" />
                계정 설정 점검
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>운영 조치 순서</CardTitle>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">점검 결과를 보고 바로 조치할 수 있는 관리자 작업 흐름입니다.</p>
              </div>
              <Badge className="w-fit bg-slate-100 text-slate-700">실운영 기준</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {priorityActions.map((action) => (
              <SystemActionCard key={action.label} {...action} />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Database} label="데이터 모드" value={system.mode === "production-db" ? "실 DB" : "저장 확인 필요"} />
          <Metric icon={ServerCog} label="앱 URL" value={system.appUrlConfigured ? "설정됨" : "미설정"} />
          <Metric icon={KeyRound} label="관리자 인증" value={system.adminConfigured ? "운영값" : "기본값"} />
          <Metric icon={ShieldAlert} label="고객사 인증" value={system.customerConfigured ? "운영값" : "기본값"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>필수 환경변수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {system.requiredEnvironment.map((item) => (
                <div key={item.key} className="grid grid-cols-[1fr_80px_90px] items-center gap-3 rounded-md border border-border p-3">
                  <code className="text-sm font-bold">{item.key}</code>
                  <Badge className={item.scope === "server" ? "justify-center" : "justify-center bg-accent/20 text-foreground"}>{item.scope}</Badge>
                  <Badge className={item.present ? "justify-center bg-primary/10 text-primary" : "justify-center bg-destructive/10 text-destructive"}>
                    {item.present ? "OK" : "누락"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>서비스 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {system.services.map((service) => (
                <div key={service.name} className="rounded-md border border-border p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-black">{service.name}</p>
                    <Badge className={service.status === "ready" ? "bg-primary/10 text-primary" : "bg-accent/20 text-foreground"}>
                      {statusLabels[service.status]}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card id="database-checks">
          <CardHeader>
            <CardTitle>Supabase 데이터 점검</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {system.databaseChecks.map((check) => (
              <div key={check.name} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-black">{check.name}</p>
                  <Badge className={check.status === "ready" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}>
                    {statusLabels[check.status]}
                  </Badge>
                </div>
                <p className="text-2xl font-black">{check.count === null ? "-" : check.count.toLocaleString()}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{check.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Storage 점검</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {system.storageChecks.map((check) => (
              <div key={check.name} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-black">{check.name}</p>
                  <Badge className={check.status === "ready" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}>
                    {statusLabels[check.status]}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{check.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              실서버 전환 체크리스트
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {[
              ["DB", "Supabase 프로젝트 생성 및 schema.sql 실행"],
              ["DB", "companies, normalized_customers, customer_imports 테이블 카운트 확인"],
              ["Storage", "customer-attachments 버킷 생성 및 파일 업로드 테스트"],
              ["Auth", "관리자 비밀번호와 세션 시크릿 운영값으로 교체"],
              ["Auth", "고객사별 계정은 고객사 관리에서 생성"],
              ["Deploy", "Vercel Production 환경변수 등록 및 재배포"],
              ["Data", "거래처 마스터 엑셀 업로드 후 업로드 이력 확인"],
              ["Data", "매출 거래원장 업로드 후 매출 원장 화면 확인"],
              ["Route", "출발지 주소와 TMAP API로 실제 경유 계산 확인"],
              ["Report", "AI 리포트가 선택 고객사 companyId 기준으로 열리는지 확인"]
            ].map(([group, item]) => (
              <div key={item} className="flex items-start gap-3 rounded-md border border-border bg-muted/35 p-3 text-sm font-bold">
                <Badge className="mt-0.5 shrink-0 bg-slate-100 text-slate-700">{group}</Badge>
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function ReadinessList({ empty, icon, items, title }: { empty: string; icon: "danger" | "warning"; items: string[]; title: string }) {
  const Icon = icon === "danger" ? ShieldAlert : AlertTriangle;
  const tone = icon === "danger" ? "text-destructive" : "text-amber-700";

  return (
    <div className="rounded-md border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <p className="font-black">{title}</p>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary">{empty}</div>
      )}
    </div>
  );
}

function SystemActionCard({
  description,
  href,
  icon: Icon,
  label,
  tone
}: {
  description: string;
  href: string;
  icon: typeof Database;
  label: string;
  tone: "default" | "ready" | "warning";
}) {
  const toneClass =
    tone === "ready"
      ? "border-primary/20 bg-primary/5 text-primary"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-white text-slate-900";

  return (
    <Link className={`group rounded-md border p-4 transition hover:border-slate-300 hover:bg-slate-50 ${toneClass}`} href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/80">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-current opacity-60 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-sm font-black">{label}</p>
      <p className="mt-2 text-xs font-semibold leading-5 opacity-75">{description}</p>
    </Link>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <Icon className="mb-4 h-5 w-5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}
