import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { NewStoreCustomerReview } from "@/components/partners/new-store-customer-review";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default async function NewStoresPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const query = await searchParams || {}, customer = await getCustomerSession(), admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, query.companyId), preview = Boolean(admin && !customer);
  if (!companyId || !isFeatureEnabled("PARTNER_REGISTRATION", companyId) || !isFeatureEnabled("NEW_STORE_CUSTOMER_REVIEW", companyId) || (customer && !customerHasCapability(customer, "manage_customers"))) notFound();
  return <CustomerAppShell active="customers" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="새 매장 확인" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}><main className="mx-auto w-full max-w-4xl px-4 py-4"><NewStoreCustomerReview companyId={preview ? companyId : ""} /></main></CustomerAppShell>;
}
