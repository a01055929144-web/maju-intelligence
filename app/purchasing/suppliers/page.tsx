import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { ProductSupplierWorkspace } from "@/components/product-supplier-workspace";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { listProductSupplierDirectory } from "@/lib/product-suppliers";

export const dynamic = "force-dynamic";

export default async function ProductSuppliersPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/dashboard");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId) || "";
  const data = await listProductSupplierDirectory(companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);

  return (
    <CustomerAppShell active="suppliers" companyName={customerSession?.companyName || "선택 고객사"} mode={isAdminPreview ? "admin-preview" : "customer"} previewCompanyId={isAdminPreview ? companyId : undefined} subtitle="매입처별 상품, 확정 원가, 원가 이력과 업로드 이력을 한 흐름에서 확인합니다." title="매입처 관리" userName={customerSession?.name || "관리자"} workspaceRole={customerSession?.workspaceRole}>
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <ProductSupplierWorkspace companyId={isAdminPreview ? companyId : ""} data={data} />
      </section>
    </CustomerAppShell>
  );
}
