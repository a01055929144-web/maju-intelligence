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
    reference: { foodPermitMatch: null, joinedFromCompanyLink: false, ntsActiveBusiness: false }, status: "pending" },
  { businessStatus: "active", confirmedAt: "2026-11-23T00:00:00.000Z", id: "30000000-0000-4000-8000-000000000003", name: "확인 완료 식당",
    reference: { foodPermitMatch: true, joinedFromCompanyLink: true, ntsActiveBusiness: true }, status: "confirmed" }
];

export default async function StorePriceVisibilityPage({ searchParams }: { searchParams: Promise<{ fixture?: string; role?: string }> }) {
  const params = await searchParams;
  if (process.env.CI_LAYOUT_FIXTURES === "enabled" && params.fixture === "1") {
    const owner = params.role !== "staff";
    const syntheticSession = { appRole: "customer_user", companyId: "00000000-0000-4000-8000-000000000001", companyName: "합성 대표 회사",
      email: "fixture@example.test", name: "합성 사용자", role: owner ? "owner" : "member", workspaceRole: owner ? "owner" : "temporary", workspaceType: "company" } as const;
    return <SettingsShell activePath="/dashboard/settings/store-price-visibility" session={syntheticSession}
      showHoldModules={false} showStorePriceVisibility subtitle="고객사가 직접 확인한 매장에만 가격을 공개합니다." title="새 매장 외식업 확인">
      <StorePriceVisibilityPanel canManage={owner} initialStores={fixture} />
    </SettingsShell>;
  }
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (!isStorePriceVisibilityEnabled(session.companyId)) notFound();
  return <SettingsShell activePath="/dashboard/settings/store-price-visibility" session={session}
    showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="고객사가 직접 확인한 매장에만 가격을 공개합니다." title="새 매장 외식업 확인">
    <StorePriceVisibilityPanel canManage={customerHasCapability(session, "manage_company")} />
  </SettingsShell>;
}
