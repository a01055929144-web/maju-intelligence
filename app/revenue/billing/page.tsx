import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { BillingWorkspace } from "@/components/billing-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";

export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  // manage_billing은 owner/manager 전용입니다(lib/workspace.ts, 2026-09-01 추가) — 카드 등록·해지처럼
  // 돈이 오가는 설정을 영업/배송기사 계정까지 열어둘 이유가 없습니다. MAJU 운영자 미리보기는 항상 허용합니다.
  const canManageBilling = isAdminPreview || customerHasCapability(customerSession, "manage_billing");

  return (
    <CustomerAppShell
      active="billing"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="구독 상태와 결제 내역을 관리합니다."
      title="결제 관리"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1240px] space-y-4 px-3 py-3 sm:px-4 sm:py-5">
        {!canManageBilling || !companyId ? (
          <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
            {!companyId ? "고객사를 먼저 선택해주세요." : "결제 관리는 대표(owner)/관리자(manager) 권한이 있는 계정만 이용할 수 있습니다."}
          </div>
        ) : <>
          <div className="maju-section-card overflow-hidden">
            <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <BillingGuide icon={CreditCard} label="1. 결제수단" text="자동결제 카드를 등록합니다." />
              <BillingGuide icon={ShieldCheck} label="2. 구독 상태" text="청구 상태와 다음 결제일을 확인합니다." />
              <BillingGuide icon={ReceiptText} label="3. 결제 내역" text="결과와 영수증을 확인합니다." />
            </div>
          </div>
          <BillingWorkspace companyId={companyId} customerEmail={customerSession?.email} customerName={customerSession?.name} />
          <div className="flex justify-end">
            <Link className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-teal-800" href={companyId ? `/revenue/transactions?companyId=${encodeURIComponent(companyId)}` : "/revenue/transactions"}>
              거래내역으로 이동 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>}
      </section>
    </CustomerAppShell>
  );
}

function BillingGuide({ icon: Icon, label, text }: { icon: typeof CreditCard; label: string; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{label}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-500">{text}</p></div>
    </div>
  );
}
