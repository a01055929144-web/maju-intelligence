import { redirect } from "next/navigation";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled, canShowLeadWorkspaceSettings, isLeadWorkspaceV2Enabled } from "@/lib/feature-modules";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "../settings-form";
import { LeadWorkspaceSettings } from "../leads/workspace";
import { SalesKitSettingsPanel } from "@/components/sales-kit-settings";
import { SalesKpiSettingsPanel } from "../sales-kpi-settings-panel";
import { SalesRegionSettings } from "../sales-region-settings";
import { SettingsShell } from "../settings-shell";

/** 11/3: 영업이 가장 중요하므로 회사 정보 옆 '영업 정보' 탭에 영업 지역·리드 설정을 모읍니다. */
export default async function SalesInformationSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const canManageLeads = canShowLeadWorkspaceSettings(session.companyId, isFeatureEnabled("DISTRIBUTOR_SALES", session.companyId)) && customerHasCapability(session, "manage_customers");
  const company = showHoldModules ? await getCompanySettings(session.companyId, session.companyName) : null;
  return (
    <SettingsShell activePath="/dashboard/settings/sales" session={session} showHoldModules={showHoldModules} subtitle="영업 지역, 리드에게 보낼 단가표·명함·주문 링크, 리드 관리 기준을 정합니다." title="영업 정보">
      <SalesRegionSettings />
      <SalesKitSettingsPanel />
      {/* V2를 안 켠 유통사 회사는 리드 칸 API가 꺼져 있어 엑셀 가져오기 탭부터 연다. */}
      {canManageLeads ? <LeadWorkspaceSettings initialTab={isLeadWorkspaceV2Enabled(session.companyId) ? "fields" : "import"} /> : null}
      {company ? <CompanySettingsForm hideAside initial={company} sections={["quote"]} showHoldModules={showHoldModules} /> : null}
      {showHoldModules ? <SalesKpiSettingsPanel canManage={customerHasCapability(session, "manage_company")} /> : null}
    </SettingsShell>
  );
}
