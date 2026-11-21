import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { CommonCategoryMappingWorkspace } from "@/components/common-category-mapping-workspace";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default async function CommonCategoriesPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || "";
  const adminPreview = Boolean(adminSession && !customerSession);
  if (!isFeatureEnabled("COMMON_CATEGORY_MAPPING", companyId)) notFound();
  if (!adminPreview && (!customerSession || !customerHasCapability(customerSession, "manage_sales") || !canManagePriceSheets(customerSession))) notFound();

  return <CustomerAppShell
    active="product-catalog"
    companyName={customerSession?.companyName || "선택 고객사"}
    mode={adminPreview ? "admin-preview" : "customer"}
    previewCompanyId={adminPreview ? companyId : undefined}
    subtitle="유통사 분류를 매장 주문의 공통 대·중·소 분류에 연결합니다."
    title="공통 카테고리 맞추기"
    userName={customerSession?.name || "관리자"}
    workspaceRole={customerSession?.workspaceRole}
  >
    <section className="w-full px-4 py-4">
      <CommonCategoryMappingWorkspace companyId={adminPreview ? companyId : ""} />
    </section>
  </CustomerAppShell>;
}
