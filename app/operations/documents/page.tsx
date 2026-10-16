import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { BusinessDocumentWorkspace } from "@/components/business-document-workspace";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function BusinessDocumentsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const params = await searchParams; const customerSession = await getCustomerSession(); const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/dashboard");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || ""; const preview = Boolean(adminSession && !customerSession);
  return <CustomerAppShell active="erp-documents" companyName={customerSession?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} subtitle="매출·매입·반품을 전표 한 곳에서 기록하고 거래처원장으로 이어갑니다." title="전표·거래처원장" userName={customerSession?.name || "관리자"} workspaceRole={customerSession?.workspaceRole}><section className="mx-auto max-w-[1560px] px-4 py-4"><BusinessDocumentWorkspace companyId={preview ? companyId : ""} /></section></CustomerAppShell>;
}

