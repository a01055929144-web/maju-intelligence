import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { PriceSheetsWorkspace } from "@/components/price-sheets-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";

export const dynamic = "force-dynamic";

export default async function MarginGroupsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !isFeatureEnabled("PRICING", companyId) || (customer && (!canManagePriceSheets(customer) || !customerHasCapability(customer, "manage_sales")))) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="마진 설정" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <section className="mx-auto max-w-6xl space-y-4 p-4"><PriceSheetsWorkspace companyId={companyId} marginTemplates={isFeatureEnabled("MARGIN_TEMPLATES", companyId)} /></section>
  </CustomerAppShell>;
}
