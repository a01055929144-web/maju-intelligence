import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { ProductCatalogAdmin } from "@/components/product-catalog-admin";
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
  const pipelineHref = `/revenue/pipeline${isAdminPreview ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;

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
        <Link className="maju-button-secondary inline-flex items-center gap-2" href={pipelineHref}>
          <ArrowLeft className="h-4 w-4" />
          영업 관리로 돌아가기
        </Link>
        <ProductCatalogAdmin companyId={isAdminPreview ? companyId : ""} />
      </section>
    </CustomerAppShell>
  );
}
