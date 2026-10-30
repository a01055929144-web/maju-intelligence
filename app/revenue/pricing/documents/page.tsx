import { notFound, redirect } from "next/navigation";
import {
  getAdminSession,
  getCustomerSession,
  resolvePageCompanyId,
} from "@/lib/auth";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { PricingDocumentsWorkspace } from "@/components/pricing-documents-workspace";
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
    !areHoldModulesEnabled(companyId) ||
    (customer &&
      !canManagePriceSheets(customer) &&
      customer.workspaceRole !== "sales")
  )
    notFound();
  return (
    <main className="mx-auto max-w-[1600px] p-4">
      <PricingDocumentsWorkspace
        companyId={companyId}
        manager={!customer || canManagePriceSheets(customer)}
      />
    </main>
  );
}
