import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, customerHasCapability, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { PricingStorePrices } from "@/components/pricing-store-prices";
import { PricingTabs } from "@/components/pricing-tabs";
import { CustomerAppShell } from "@/components/customer-app-shell";

export const dynamic = "force-dynamic";

// CC-30b: 매장 가격(이 매장엔 얼마에 파나?). 권한은 가격 관리(마진 설정)와 같다 — 대표·관리자.
export default async function StorePricesPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !isFeatureEnabled("PRICING", companyId) || (customer && (!canManagePriceSheets(customer) || !customerHasCapability(customer, "manage_sales")))) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell headerNav={<PricingTabs active="store-prices" previewCompanyId={preview ? companyId : undefined} showStorePrices />} active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="매장 가격" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="w-full space-y-4"><PricingStorePrices storeGradesEnabled={isFeatureEnabled("STORE_GRADES", companyId)} companyId={companyId} userKey={`${companyId}:${customer?.name || admin?.name || "admin"}`} /></main>
  </CustomerAppShell>;
}
