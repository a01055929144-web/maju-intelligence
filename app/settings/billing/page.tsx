import { redirect } from "next/navigation";
import { BillingWorkspace } from "@/components/billing-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";

export default async function BillingSettingsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const canManageBilling = isAdminPreview || customerHasCapability(customerSession, "manage_billing");
  return (
    <CustomerAppShell active="billing" companyName={customerSession?.companyName || "선택 고객사"} mode={isAdminPreview ? "admin-preview" : "customer"} previewCompanyId={isAdminPreview ? companyId : undefined} subtitle="요금제, 등록 카드와 결제 내역을 관리합니다." title="구독·결제" userName={customerSession?.name || "관리자"} workspaceRole={customerSession?.workspaceRole}>
      <section className="mx-auto max-w-[1240px] space-y-4 px-3 py-3 sm:px-4 sm:py-5">
        {!canManageBilling || !companyId ? <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">{!companyId ? "고객사를 먼저 선택해주세요." : "구독·결제는 대표 또는 관리자 권한이 있는 계정만 이용할 수 있습니다."}</div> : <BillingWorkspace companyId={companyId} customerEmail={customerSession?.email} customerName={customerSession?.name} />}
      </section>
    </CustomerAppShell>
  );
}
