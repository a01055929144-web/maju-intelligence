import { redirect } from "next/navigation";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled, isLeadWorkspaceV2Enabled } from "@/lib/feature-modules";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "../settings-form";
import { LeadWorkspaceSettings } from "../leads/workspace";
import { SalesKpiSettingsPanel } from "../sales-kpi-settings-panel";
import { SalesRegionSettings } from "../sales-region-settings";
import { SettingsShell } from "../settings-shell";

/** 11/3: 영업이 가장 중요하므로 회사 정보 옆 '영업 정보' 탭에 영업 지역·리드 설정을 모읍니다. */
export default async function SalesInformationSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const canManageLeads = isLeadWorkspaceV2Enabled(session.companyId) && customerHasCapability(session, "manage_customers");
  const company = showHoldModules ? await getCompanySettings(session.companyId, session.companyName) : null;
  return (
    <SettingsShell activePath="/dashboard/settings/sales" session={session} showHoldModules={showHoldModules} subtitle="리드를 모을 영업 지역과 리드 관리 기준을 정합니다. 배송 지역을 저장하면 영업 지역에도 자동으로 추가됩니다." title="영업 정보">
      <SalesRegionSettings />
      {canManageLeads ? <LeadWorkspaceSettings /> : null}
      {company ? <CompanySettingsForm hideAside initial={company} sections={["quote"]} showHoldModules={showHoldModules} /> : null}
      {showHoldModules ? <SalesKpiSettingsPanel canManage={customerHasCapability(session, "manage_company")} /> : null}
    </SettingsShell>
  );
}
