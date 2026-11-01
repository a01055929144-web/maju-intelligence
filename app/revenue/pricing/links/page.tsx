import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StoreLinksWorkspace } from "@/components/store-links-workspace";

export const dynamic = "force-dynamic";

export default async function StoreLinksPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !areHoldModulesEnabled(companyId) ||
    (customer && !canManagePriceSheets(customer))) notFound();
  return <main className="mx-auto max-w-6xl p-4"><StoreLinksWorkspace companyId={companyId} /></main>;
}
