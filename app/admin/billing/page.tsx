import { redirect } from "next/navigation";
import { AdminBillingWorkspace } from "@/components/admin-billing-workspace";
import { getAdminSession } from "@/lib/auth";
import { listSubscriptionsForAdmin } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { AdminPlanSettingsWorkspace } from "./plan-settings-workspace";

export default async function AdminBillingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const billingV2Enabled = process.env.WO8_BILLING_V2_ENABLED === "true";

  const result = await listSubscriptionsForAdmin()
    .then((subscriptions) => ({ loadError: "", subscriptions }))
    .catch(() => ({ loadError: "결제 정보를 불러오지 못했습니다. 잠시 후 다시 시도하거나 시스템 점검에서 연결 상태를 확인해주세요.", subscriptions: [] }));

  // CC-22b: 본사(internal)·파일럿은 청구 대상에서 빼고 "면제"로 따로 보여 준다.
  const exempt = result.subscriptions.filter((row) => row.companyKind !== "customer");
  const billable = result.subscriptions.filter((row) => row.companyKind === "customer");

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AdminPageHeader active="billing" badge="결제 관리" session={session} subtitle="고객사별 월 이용료와 자동결제 상태" title="결제 관리" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-4">
        <AdminBillingWorkspace initialSubscriptions={billable} loadError={result.loadError} />
        {exempt.length ? (
          <section aria-label="청구 면제" className="maju-section-card mt-4">
            <div className="maju-card-header"><p className="maju-section-title">청구 면제 ({exempt.length}곳)</p><p className="mt-1 maju-muted-label">본사(내부)·파일럿 계정은 청구·카드 경고 대상이 아닙니다.</p></div>
            <ul className="divide-y divide-slate-100">{exempt.map((row) => <li className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2 text-sm" key={row.companyId}><span className="font-black">{row.companyName}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{row.companyKind === "internal" ? "본사 · 면제" : "파일럿 · 면제"}</span></li>)}</ul>
          </section>
        ) : null}
        {billingV2Enabled ? <AdminPlanSettingsWorkspace /> : null}
      </main>
    </div>
  );
}
