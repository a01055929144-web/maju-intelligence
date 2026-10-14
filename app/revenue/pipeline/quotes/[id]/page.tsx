import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesQuoteEditWorkspace } from "@/components/sales-quote-edit-workspace";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesQuoteForEdit } from "@/lib/store";

export default async function SalesQuoteEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ companyId?: string }> }) {
  const [{ id }, query, customerSession, adminSession] = await Promise.all([params, searchParams, getCustomerSession(), getAdminSession()]);
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/revenue/pipeline?section=quotes");
  const companyId = resolvePageCompanyId(customerSession, adminSession, query?.companyId);
  if (!companyId) notFound();
  const quote = await getSalesQuoteForEdit(companyId, id);
  if (!quote) notFound();
  const isAdminPreview = Boolean(adminSession && !customerSession);
  return (
    <CustomerAppShell active="revenue" companyName={customerSession?.companyName || "선택 고객사"} mode={isAdminPreview ? "admin-preview" : "customer"} previewCompanyId={isAdminPreview ? companyId : undefined} subtitle="임시저장 견적을 이어 쓰거나 발행된 견적을 수정합니다." title="견적 수정" userName={customerSession?.name || "관리자"} workspaceRole={customerSession?.workspaceRole}>
      <SalesQuoteEditWorkspace quote={quote} />
    </CustomerAppShell>
  );
}
