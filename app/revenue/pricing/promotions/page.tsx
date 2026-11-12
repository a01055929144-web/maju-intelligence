import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { PricingPromotionsWorkspace } from "@/components/pricing-promotions-workspace";
import { PricingTabs } from "@/components/pricing-tabs";
import { companyUsesStorePrices } from "@/lib/pricing/store-price-usage";
import { CustomerAppShell } from "@/components/customer-app-shell";
export const dynamic = "force-dynamic";
// CC-20: 행사·임박 독립 화면. 권한은 견적서·단가표 화면과 같다.
export default async function PromotionsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession(), admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const query = await searchParams;
  const companyId = resolvePageCompanyId(customer, admin, query?.companyId);
  if (!companyId || !isFeatureEnabled("PRICING", companyId) || (customer && !canManagePriceSheets(customer) && customer.workspaceRole !== "sales")) notFound();
  const preview = Boolean(admin && !customer);
  const manager = !customer || canManagePriceSheets(customer);
  const showStorePrices = manager && await companyUsesStorePrices(companyId);
  return <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="행사·임박" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="mx-auto max-w-[1600px] space-y-4 p-4">{manager ? <PricingTabs active="promotions" previewCompanyId={preview ? companyId : undefined} showStorePrices={showStorePrices} /> : null}<PricingPromotionsWorkspace audienceEnabled={isFeatureEnabled("PROMOTION_AUDIENCE", companyId)} companyId={companyId} manager={manager} userKey={`${companyId}:${customer?.name || admin?.name || "admin"}`} /></main>
  </CustomerAppShell>;
}
