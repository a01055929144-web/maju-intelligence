import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getManagedCompanyAccounts } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { getStageFQueue } from "./stage-f-read";

export default async function AdminOperationsPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const enabled = process.env.ADMIN_STAGE_F_QUEUE_ENABLED === "true";
  const params = await searchParams;
  const companiesResult = enabled
    ? await getManagedCompanyAccounts().catch(() => null)
    : null;
  const companies = companiesResult?.companies ?? [];
  const selected = companies.find((company) => company.id === params.companyId);
  const queue = selected ? await getStageFQueue(selected.id) : [];

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="system" badge="Stage F · 기본 OFF" session={session} subtitle="회사별 적재·품목·링크·주문의 명시적 원천 오류만 확인합니다" title="운영 오류 큐" />
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {!enabled ? (
          <Notice title="운영 오류 큐가 꺼져 있습니다." description="ADMIN_STAGE_F_QUEUE_ENABLED=true인 비운영 검증 환경에서만 조회할 수 있습니다." />
        ) : !companiesResult ? (
          <Notice title="고객사 목록을 불러오지 못했습니다." description="고객사 0건이 아니라 조회 실패 상태입니다. 시스템 연결을 확인해 주세요." error />
        ) : (
          <>
            <Card className="shadow-none">
              <CardContent className="p-4">
                <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
                  <label className="flex-1 text-sm font-semibold text-slate-700">
                    고객사
                    <select className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3" defaultValue={selected?.id || ""} name="companyId">
                      <option value="">고객사를 선택하세요</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.id}</option>)}
                    </select>
                  </label>
                  <button className="h-11 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">조회</button>
                </form>
              </CardContent>
            </Card>

            {selected ? (
              <div className="grid gap-4 md:grid-cols-2">
                {queue.map((source) => (
                  <Card className={source.status === "error" ? "border-destructive/30 shadow-none" : "shadow-none"} key={source.key}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {source.status === "error" ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                          {source.label}
                        </CardTitle>
                        <Badge className={source.status === "error" ? "bg-destructive/10 text-destructive" : source.count ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                          {source.status === "error" ? "조회 실패" : `${source.count}건`}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{source.message}</p>
                      {source.ids.length ? <p className="mt-3 break-all rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">{source.ids.join(", ")}{source.count && source.count > source.ids.length ? ` 외 ${source.count - source.ids.length}건` : ""}</p> : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Notice title={companies.length ? "고객사를 선택하세요." : "등록된 고객사가 없습니다."} description={companies.length ? "선택한 회사 ID 범위에서만 오류 원천을 조회합니다." : "조회는 성공했으며 정상 0건 상태입니다."} />
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Notice({ description, error = false, title }: { description: string; error?: boolean; title: string }) {
  return (
    <Card className={error ? "border-destructive/30 bg-destructive/5 shadow-none" : "shadow-none"}>
      <CardContent className="flex gap-3 p-6">
        {error ? <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" /> : <ListChecks className="h-5 w-5 shrink-0 text-primary" />}
        <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </CardContent>
    </Card>
  );
}
