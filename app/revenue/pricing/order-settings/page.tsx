import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { StoreOrderSettingsWorkspace } from "@/components/store-order-settings-workspace";

export const dynamic = "force-dynamic";

export default async function OrderSettingsPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
      (customer && !canManagePriceSheets(customer))) notFound();
  return <main className="mx-auto max-w-6xl p-4">
    <StoreOrderSettingsWorkspace companyId={companyId} />
  </main>;
}
