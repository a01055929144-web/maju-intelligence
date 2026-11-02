import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { ProductCatalogWorkspace } from "@/components/product-catalog-workspace";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";
import { customerItemsFileImportEnabled } from "../../../lib/customer-items-import";
import { areHoldModulesEnabled } from "../../../lib/feature-modules";
import { isFeatureEnabled } from "../../../lib/feature-flags";

export default async function ProductCatalogPage({ searchParams }: { searchParams?: Promise<{ companyId?: string; tab?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || "";
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) notFound();
  const isAdminPreview = Boolean(adminSession && !customerSession);
  // 매입처 상품 · 표준 품목 연결 탭은 없앴다(2149). 예전 주소(?tab=supplier|mapping)는 전체 상품으로 연다.
  const initialTab = params?.tab === "imports" ? "imports" : "catalog";

  return (
    <CustomerAppShell
      active="product-catalog"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="단가표 · 견적서 · 행사 · 임박에 쓰는 회사의 전체 상품을 관리합니다."
      title="상품관리"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <ProductCatalogWorkspace
          key={companyId}
          categoriesEnabled={isFeatureEnabled("PRODUCT_CATEGORIES", companyId)}
          companyId={isAdminPreview ? companyId : ""}
          importAuditV2Enabled={isFeatureEnabled("PRODUCT_IMPORT_AUDIT_V2", companyId)}
          importTargetsEnabled={isFeatureEnabled("PRODUCT_IMPORT_TARGETS", companyId)}
          customerItemsEnabled={customerItemsFileImportEnabled(companyId) && areHoldModulesEnabled(companyId)}
          rowEditorEnabled={isFeatureEnabled("IMPORT_ROW_EDITOR", companyId)}
          initialTab={initialTab}
          tableSettingsKey={`products:${customerSession?.userId || adminSession?.email || "unknown"}`}
        />
      </section>
    </CustomerAppShell>
  );
}
