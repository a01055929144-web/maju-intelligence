import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StoreLinksWorkspace } from "@/components/store-links-workspace";
import { storeLinkDetailEnabled } from "@/lib/pricing/store-link-detail-feature";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { PricingTabs } from "@/components/pricing-tabs";
import { CompanyPublicLinks } from "@/components/company-public-links";
import { companyUsesStorePrices } from "@/lib/pricing/store-price-usage";

export const dynamic = "force-dynamic";

export default async function StoreLinksPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
    (customer && !canManagePriceSheets(customer))) notFound();
  // CX-140 ⑤: 플래그가 켜진 회사만 공통 틀(CustomerAppShell + PricingTabs)과 공개 링크 표. 꺼져 있으면 지금과 같다.
  if (!isFeatureEnabled("COMPANY_LINK_UNIFY", companyId))
    return <main className="w-full p-4"><StoreLinksWorkspace companyId={companyId} detailEnabled={storeLinkDetailEnabled(companyId)} /></main>;
  const preview = Boolean(admin && !customer);
  const showStorePrices = await companyUsesStorePrices(companyId);
  return <CustomerAppShell headerNav={<PricingTabs active="links" previewCompanyId={preview ? companyId : undefined} showStorePrices={showStorePrices} />} active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="링크" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <section className="w-full space-y-6">
      <CompanyPublicLinks companyId={preview ? companyId : undefined} />
      <StoreLinksWorkspace companyId={companyId} detailEnabled={storeLinkDetailEnabled(companyId)} />
    </section>
  </CustomerAppShell>;
}
