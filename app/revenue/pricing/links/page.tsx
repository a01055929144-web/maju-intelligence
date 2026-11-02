import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StoreLinksWorkspace } from "@/components/store-links-workspace";
import { isId } from "@/domains/pricing/document";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StoreLinksPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string; leadId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const query = await searchParams;
  const companyId = resolvePageCompanyId(customer, admin, query?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
    (customer && !canManagePriceSheets(customer))) notFound();
  const acceptanceEnabled = isFeatureEnabled("QUOTE_ACCEPTANCE", companyId);
  let initialLead;
  if (query?.leadId) {
    if (!acceptanceEnabled || !isId(query.leadId)) notFound();
    const [lead] = await supabaseRequest<{ id: string; business_name: string; phone: string | null; address: string | null }[]>(
      `business_permit_leads?company_id=eq.${companyId}&id=eq.${query.leadId}&is_active=eq.true&merged_into_lead_id=is.null&select=id,business_name,phone,address&limit=1`);
    if (!lead) notFound();
    initialLead = { id: lead.id, name: lead.business_name, phone: lead.phone || "", address: lead.address || "" };
  }
  return <main className="mx-auto max-w-6xl p-4"><StoreLinksWorkspace companyId={companyId}
    acceptanceEnabled={acceptanceEnabled} initialLead={initialLead} /></main>;
}
