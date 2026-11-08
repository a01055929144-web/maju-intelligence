import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StoreLinksWorkspace } from "@/components/store-links-workspace";
import { readOnlyStoreLinksEnabled } from "@/lib/pricing/read-only-store-links-feature";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

export const dynamic = "force-dynamic";

export default async function StoreLinksPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string; fixture?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const params = await searchParams;
  const companyId = resolvePageCompanyId(customer, admin, params?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
    (customer && !canManagePriceSheets(customer))) notFound();
  const readOnlyAvailable = readOnlyStoreLinksEnabled(companyId) || (isCiLayoutFixturesEnabled() && params?.fixture === "read-only-link-issuance");
  return <main className="mx-auto max-w-6xl p-4"><StoreLinksWorkspace companyId={companyId} readOnlyAvailable={readOnlyAvailable} /></main>;
}
