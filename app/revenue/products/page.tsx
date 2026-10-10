import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { ProductCatalogAdmin } from "@/components/product-catalog-admin";
import { SalesWorkspaceNav } from "@/components/sales-workspace-nav";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";

export default async function ProductCatalogPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/revenue/pipeline");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || "";
  const isAdminPreview = Boolean(adminSession && !customerSession);

  return (
    <CustomerAppShell
      active="product-catalog"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="매입 품목과 판매 품목의 연결 상태와 가격을 관리합니다."
      title="상품 매칭 원장"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <SalesWorkspaceNav active="products" companyId={companyId} />
        <ProductCatalogAdmin companyId={isAdminPreview ? companyId : ""} />
      </section>
    </CustomerAppShell>
  );
}
