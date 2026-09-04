import { redirect } from "next/navigation";
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
      subtitle="카드 자동결제로 매달 이용료를 납부합니다."
      title="결제 관리"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1100px] px-4 py-4 sm:px-4">
        {!canManageBilling || !companyId ? (
          <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
            {!companyId ? "고객사를 먼저 선택해주세요." : "결제 관리는 대표(owner)/관리자(manager) 권한이 있는 계정만 이용할 수 있습니다."}
          </div>
        ) : (
          <BillingWorkspace companyId={companyId} customerEmail={customerSession?.email} customerName={customerSession?.name} />
        )}
      </section>
    </CustomerAppShell>
  );
}
