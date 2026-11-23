import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { orderFulfillmentEnabled } from "@/lib/order-fulfillment-feature";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { OrderFulfillmentWorkspace } from "@/components/order-fulfillment-workspace";

export const dynamic = "force-dynamic";
export default async function FulfillmentPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const customer = await getCustomerSession(); const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !orderFulfillmentEnabled(companyId) || (customer && !canManagePriceSheets(customer) && !["sales", "delivery"].includes(customer.workspaceRole || ""))) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="출고 준비" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}><main className="w-full p-4"><OrderFulfillmentWorkspace companyId={companyId} preview={preview} /></main></CustomerAppShell>;
}
