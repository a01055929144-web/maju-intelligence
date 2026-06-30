import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, MapPin, Navigation, Route, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VisitResultForm } from "@/components/visit-result-form";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getTodayRoutePlan } from "@/lib/store";

export default async function TodayRoutePage() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");

  const routePlan = await getTodayRoutePlan(customerSession?.companyId);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">Route Intelligence</Badge>
            <h1 className="text-2xl font-black">오늘의 방문 계획</h1>
            <p className="mt-1 text-sm text-muted-foreground">방문 예정, 오늘 추천, 계약 가능 리드를 지역별로 묶었습니다.</p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
            href={customerSession ? "/dashboard" : "/admin"}
          >
            돌아가기
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric icon={CalendarCheck} label="오늘 방문" value={`${routePlan.totalStops}곳`} />
          <Metric icon={Target} label="예상 월매출" value={`${routePlan.totalExpectedRevenue.toLocaleString()}만원`} />
          <Metric icon={Route} label="지역 묶음" value={`${routePlan.groups.length}개`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-primary" />
              권장 방문 순서
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {routePlan.groups.map((group) => (
              <div key={group.region} className="rounded-md border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{group.region}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.stops.length}곳 · 예상 월 {group.expectedRevenue.toLocaleString()}만원
                    </p>
                  </div>
                  <Badge className="bg-primary/10 text-primary">지역 묶음</Badge>
                </div>
                <div className="space-y-2">
                  {group.stops.map((stop) => (
                    <div key={stop.id || stop.name} className="rounded-md bg-muted/35 p-3">
                      <div className="grid gap-3 sm:grid-cols-[44px_1fr_90px_110px] sm:items-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{stop.order}</span>
                        <div>
                          <p className="font-bold">{stop.name}</p>
                          <p className="text-xs text-muted-foreground">{stop.region} · 예상 월 {stop.expectedRevenue}만원</p>
                        </div>
                        <Badge className="justify-center bg-accent/20 text-foreground">{stop.score}점</Badge>
                        <span className="text-xs font-bold text-muted-foreground">방문 후보</span>
                      </div>
                      <div className="mt-3 border-t border-border pt-3">
                        <VisitResultForm expectedRevenue={stop.expectedRevenue} leadId={stop.id} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!routePlan.groups.length ? (
              <div className="rounded-md border border-border bg-muted/35 p-6 text-center">
                <MapPin className="mx-auto mb-3 h-8 w-8 text-primary" />
                <p className="font-black">방문 예정 리드가 없습니다.</p>
                <p className="mt-1 text-sm text-muted-foreground">대시보드에서 리드 상태를 방문 예정 또는 오늘 추천으로 변경하세요.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarCheck; label: string; value: string }) {
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
