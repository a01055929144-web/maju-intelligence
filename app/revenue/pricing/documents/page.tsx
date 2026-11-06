import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getAdminSession,
  getCustomerSession,
  resolvePageCompanyId,
} from "@/lib/auth";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { PricingDocumentsWorkspace } from "@/components/pricing-documents-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { resolveDocumentEntry } from "@/application/pricing/document-entry";
import { findDocumentEntryLead } from "@/lib/pricing/document-entry";
import { documentSharingEnabled } from "@/lib/pricing/document-share-feature";
export const dynamic = "force-dynamic";
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ companyId?: string; start?: string | string[]; leadId?: string | string[] }>;
}) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession(),
    admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const query = await searchParams;
  const companyId = resolvePageCompanyId(
    customer,
    admin,
    query?.companyId,
  );
  if (
    !companyId ||
    !isFeatureEnabled("PRICING", companyId) ||
    (customer &&
      !canManagePriceSheets(customer) &&
      customer.workspaceRole !== "sales")
  )
    notFound();
  const preview = Boolean(admin && !customer);
  const manager = !customer || canManagePriceSheets(customer);
  const entry = await resolveDocumentEntry({ companyId, manager, preview }, query || {}, findDocumentEntryLead);
  if (!entry) notFound();
  return (
    <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="견적서·단가표" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="mx-auto max-w-[1600px] p-4">
      <Suspense fallback={null}>
        <PricingDocumentsWorkspace
          key={`${companyId}:${entry.leadContext?.id || ""}:${entry.initialStartKind || ""}`}
          companyId={companyId}
          initialStartKind={entry.initialStartKind}
          leadContext={entry.leadContext}
          sharingEnabled={documentSharingEnabled(companyId)}
          storeLinksEnabled={storeOrderingEnabled() && isFeatureEnabled("STORE_ORDERING", companyId)}
          manager={manager}
        />
      </Suspense>
    </main>
    </CustomerAppShell>
  );
}
