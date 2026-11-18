import { notFound, redirect } from "next/navigation";
import { StorePriceVisibilityPanel } from "@/components/store-price-visibility-panel";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { isStorePriceVisibilityEnabled } from "@/lib/store/07-store-price-visibility-feature";
import type { StorePriceVisibilityItem } from "@/lib/store/07-store-price-visibility";
import { SettingsShell } from "../settings-shell";

const fixture: StorePriceVisibilityItem[] = [
  { businessStatus: "active", confirmedAt: null, id: "10000000-0000-4000-8000-000000000001", name: "한결식당 연남점",
    reference: { foodPermitMatch: true, joinedFromCompanyLink: true, ntsActiveBusiness: true }, status: "pending" },
  { businessStatus: "registration_pending", confirmedAt: null, id: "20000000-0000-4000-8000-000000000002", name: "개업 준비 매장",
    reference: { foodPermitMatch: null, joinedFromCompanyLink: false, ntsActiveBusiness: false }, status: "pending" }
];

export default async function StorePriceVisibilityPage({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  if (process.env.CI_LAYOUT_FIXTURES === "enabled" && (await searchParams).fixture === "1")
    return <main className="min-h-screen bg-slate-50 p-3 sm:p-6"><StorePriceVisibilityPanel canManage initialStores={fixture} /></main>;
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (!isStorePriceVisibilityEnabled(session.companyId)) notFound();
  return <SettingsShell activePath="/dashboard/settings/store-price-visibility" session={session}
    showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="고객사가 직접 확인한 매장에만 가격을 공개합니다." title="새 매장 외식업 확인">
    <StorePriceVisibilityPanel canManage={customerHasCapability(session, "manage_company")} />
  </SettingsShell>;
}
