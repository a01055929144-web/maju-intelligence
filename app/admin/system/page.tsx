import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Database, KeyRound, ServerCog, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminSession } from "@/lib/auth";
import { getSystemDiagnostics } from "@/lib/store";

const statusLabels = {
  ready: "준비됨",
  fallback: "점검 필요",
  missing: "누락"
};

export default async function AdminSystemPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const system = await getSystemDiagnostics();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">System Check</Badge>
            <h1 className="text-2xl font-black">운영 설정 점검</h1>
            <p className="mt-1 text-sm text-muted-foreground">실서버 배포 전 DB, 인증, 환경변수 상태를 확인합니다.</p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
            href="/admin"
          >
            관리자 홈
          </Link>
        </div>
      </header>

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

        <Card>
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
              "Supabase 프로젝트 생성",
              "supabase/schema.sql 실행",
              "Vercel 환경변수 등록",
              "customer-attachments Storage 버킷 생성",
              "GitHub 저장소 연결",
              "관리자 비밀번호 교체",
              "고객사 로그인 정책 확정",
              "실제 엑셀 업로드 테스트",
              "리포트 품질 검수"
            ].map((item) => (
              <div key={item} className="rounded-md border border-border bg-muted/35 p-3 text-sm font-bold">
                {item}
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
