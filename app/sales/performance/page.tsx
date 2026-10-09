import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { Progress } from "@/components/ui/progress";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getCompanySalesKpiOverview } from "@/lib/store";
import { normalizeWorkspaceRole, workspaceRoleLabels } from "@/lib/workspace";

export default async function SalesPerformancePage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId);
  const overview = companyId ? await getCompanySalesKpiOverview(companyId) : { members: [], periodMonth: new Date().toISOString().slice(0, 7) };
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const targetContacts = overview.members.reduce((sum, member) => sum + member.targetContacts, 0);
  const actualContacts = overview.members.reduce((sum, member) => sum + member.actualContacts, 0);
  const targetQuotes = overview.members.reduce((sum, member) => sum + member.targetQuotes, 0);
  const actualQuotes = overview.members.reduce((sum, member) => sum + member.actualQuotes, 0);
  const targetConversions = overview.members.reduce((sum, member) => sum + member.targetConversions, 0);
  const actualConversions = overview.members.reduce((sum, member) => sum + member.actualConversions, 0);

  return (
    <CustomerAppShell
      active="sales-performance"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="담당자별 목표와 컨택·견적·전환 실적을 비교합니다."
      title="영업 성과"
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-3 py-4 sm:px-4">
        <div className="maju-section-card overflow-hidden">
          <div className="maju-card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="maju-section-title">{overview.periodMonth.replace("-", ".")} 영업 KPI</p>
              <p className="mt-1 text-sm text-slate-500">회사 공통 목표를 가입 직원별 실적과 연결해 보여줍니다.</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800"><Users className="mr-1 h-3.5 w-3.5" />담당자 {overview.members.length}명</Badge>
          </div>
          <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            <KpiSummary label="컨택" actual={actualContacts} target={targetContacts} />
            <KpiSummary label="견적" actual={actualQuotes} target={targetQuotes} />
            <KpiSummary label="전환" actual={actualConversions} target={targetConversions} />
          </div>
        </div>

        <section className="maju-section-card overflow-hidden">
          <div className="maju-card-header flex items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">담당자별 달성 현황</p>
              <p className="mt-1 text-sm text-slate-500">컨택·견적·거래처 전환을 같은 기준으로 비교합니다.</p>
            </div>
            <Link className="maju-button-secondary" href="/dashboard/settings#sales-policy">목표 설정 <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {overview.members.length ? (
            <div className="divide-y divide-slate-100">
              {overview.members.map((member) => (
                <article className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)_110px] lg:items-center" key={member.userId}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-950">{member.name}</p>
                      <Badge className="bg-slate-100 text-slate-600">{workspaceRoleLabels[normalizeWorkspaceRole(member.role)]}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">이번 달 활동 기준</p>
                  </div>
                  <div className="min-w-0 space-y-3">
                    <Progress value={member.achievementRate} />
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <KpiCell label="컨택" actual={member.actualContacts} target={member.targetContacts} />
                      <KpiCell label="견적" actual={member.actualQuotes} target={member.targetQuotes} />
                      <KpiCell label="전환" actual={member.actualConversions} target={member.targetConversions} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-teal-50 px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-teal-800">{member.achievementRate}%</p>
                    <p className="mt-1 text-xs font-semibold text-teal-700">종합 달성</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <Target className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-950">비교할 가입 직원이 없습니다.</p>
              <p className="mt-1 text-sm text-slate-500">회사 설정에서 직원을 초대하고 공통 영업 목표를 저장하면 달성률이 표시됩니다.</p>
            </div>
          )}
        </section>
      </section>
    </CustomerAppShell>
  );
}

function KpiSummary({ actual, label, target }: { actual: number; label: string; target: number }) {
  const rate = target ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold text-slate-950">{actual.toLocaleString()}<span className="ml-1 text-sm font-semibold text-slate-400">/ {target.toLocaleString()}</span></p>
        <span className="text-sm font-bold text-teal-700">{rate}%</span>
      </div>
      <Progress className="mt-3" value={rate} />
    </div>
  );
}

function KpiCell({ actual, label, target }: { actual: number; label: string; target: number }) {
  return <div className="rounded-md bg-slate-50 px-2 py-2 text-center"><p className="font-semibold text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{actual}/{target}</p></div>;
}
