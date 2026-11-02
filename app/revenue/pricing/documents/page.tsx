import { notFound, redirect } from "next/navigation";
import {
  getAdminSession,
  getCustomerSession,
  resolvePageCompanyId,
} from "@/lib/auth";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { PricingDocumentsWorkspace } from "@/components/pricing-documents-workspace";
import { CustomerAppShell } from "@/components/customer-app-shell";
export const dynamic = "force-dynamic";
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession(),
    admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(
    customer,
    admin,
    (await searchParams)?.companyId,
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
  return (
    <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="견적서·단가표" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="mx-auto max-w-[1600px] p-4">
      <PricingDocumentsWorkspace
        companyId={companyId}
        manager={!customer || canManagePriceSheets(customer)}
      />
    </main>
    </CustomerAppShell>
  );
}
