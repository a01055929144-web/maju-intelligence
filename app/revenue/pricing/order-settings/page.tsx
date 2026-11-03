import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { StoreOrderSettingsWorkspace } from "@/components/store-order-settings-workspace";

export const dynamic = "force-dynamic";

export default async function OrderSettingsPage({ searchParams }: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  // 11/3: 고객사 화면에서는 설정 > 회사 정보 '주문' 탭으로 옮겼습니다. 관리자 미리보기만 이 화면을 씁니다.
  if (customer) redirect("/dashboard/settings/company?tab=order");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !(isFeatureEnabled("PRICING", companyId) && isFeatureEnabled("STORE_ORDERING", companyId)) ||
      (customer && !canManagePriceSheets(customer))) notFound();
  return <main className="mx-auto max-w-6xl p-4">
    <StoreOrderSettingsWorkspace companyId={companyId} />
  </main>;
}
