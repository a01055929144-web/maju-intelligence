import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Database, KeyRound, ServerCog, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getSystemStatus } from "@/lib/store";

const statusLabels = {
  ready: "준비됨",
  fallback: "Fallback",
  missing: "누락"
};

export default function AdminSystemPage() {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  const system = getSystemStatus();

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
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Database} label="데이터 모드" value={system.mode === "production-db" ? "실 DB" : "Local"} />
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

