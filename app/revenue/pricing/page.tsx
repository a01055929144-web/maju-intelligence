import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { PurchaseCostWorkspace } from "@/components/purchase-cost-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";
export const dynamic = "force-dynamic";
export default async function PricingPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !isFeatureEnabled("PRICING", companyId) || (customer && !canManagePriceSheets(customer))) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="매입가 업로드" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <section className="w-full space-y-4 p-4"><PurchaseCostWorkspace companyId={companyId} /></section>
  </CustomerAppShell>;
}
