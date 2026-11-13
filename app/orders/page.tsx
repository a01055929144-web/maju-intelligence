import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { OrderInboxWorkspace } from "@/components/order-inbox-workspace";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
    (customer && !canManagePriceSheets(customer) && customer.workspaceRole !== "sales")) notFound();
  const preview = Boolean(admin && !customer);
  return <CustomerAppShell active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={preview ? companyId : undefined} title="주문 확인" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="w-full p-4">
      {/* 확인 처리는 고객사 대표·관리자만. 영업과 MAJU 관리자 미리보기는 보기만 한다. */}
      <OrderInboxWorkspace canConfirm={Boolean(customer && canManagePriceSheets(customer))} companyId={companyId} preview={preview} />
    </main>
  </CustomerAppShell>;
}
