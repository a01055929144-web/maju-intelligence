import { redirect } from "next/navigation";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "../settings-form";
import { SalesKpiSettingsPanel } from "../sales-kpi-settings-panel";
import { SettingsShell } from "../settings-shell";
import { SalesRegionSettings } from "../sales-region-settings";

export default async function CompanyInformationSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const company = await getCompanySettings(session.companyId, session.companyName);
  return (
    <SettingsShell activePath="/dashboard/settings/company" session={session} showHoldModules={showHoldModules} subtitle="회사 정보, 출발지와 알림 기준을 관리합니다." title="회사 정보">
      <CompanySettingsForm initial={company} showHoldModules={showHoldModules} />
      <SalesRegionSettings />
      {showHoldModules ? <SalesKpiSettingsPanel canManage={customerHasCapability(session, "manage_company")} /> : null}
    </SettingsShell>
  );
}
