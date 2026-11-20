import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { PartnerRegistrationForm } from "@/components/partners/partner-registration-form";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

export default async function PartnerRegisterPage({ searchParams }: { searchParams?: Promise<{ companyId?: string; type?: string }> }) {
  const query = await searchParams || {}, customer = await getCustomerSession(), admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, query.companyId);
  const partnerType = query.type === "supplier" ? "supplier" : "customer";
  const capability = partnerType === "supplier" ? "manage_sales" : "manage_customers";
  if (!companyId || !isFeatureEnabled("PARTNER_REGISTRATION", companyId) || (customer && !customerHasCapability(customer, capability))) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell active={partnerType === "supplier" ? "suppliers" : "customers"} companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="거래처 등록" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}><main className="mx-auto w-full max-w-4xl px-4 py-4"><PartnerRegistrationForm companyId={preview ? companyId : ""} partnerType={partnerType} /></main></CustomerAppShell>;
}
