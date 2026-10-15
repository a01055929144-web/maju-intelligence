import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { ProductCatalogWorkspace } from "@/components/product-catalog-workspace";
import { SalesWorkspaceNav } from "@/components/sales-workspace-nav";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";

export default async function ProductCatalogPage({ searchParams }: { searchParams?: Promise<{ companyId?: string; tab?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/revenue/pipeline");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || "";
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const initialTab = params?.tab === "mapping" || params?.tab === "supplier" ? params.tab : "catalog";
  const standardsView = initialTab === "mapping";

  return (
    <CustomerAppShell
      active={standardsView ? "product-standards" : "product-catalog"}
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle={standardsView ? "회사 상품과 표준 품목의 연결을 확인합니다." : "회사가 판매하는 마스터 상품과 매입처 상품을 관리합니다."}
      title={standardsView ? "표준 품목 관리" : "상품관리"}
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <SalesWorkspaceNav active="products" companyId={companyId} />
        <ProductCatalogWorkspace companyId={isAdminPreview ? companyId : ""} initialTab={initialTab} />
      </section>
    </CustomerAppShell>
  );
}
