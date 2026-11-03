import { redirect } from "next/navigation";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getAppUserLoginMethods, getCompanySettings } from "@/lib/store";
import { MyAccountLoginCard } from "@/components/my-account-login-card";
import { CompanySettingsForm } from "../settings-form";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { SalesKpiSettingsPanel } from "../sales-kpi-settings-panel";
import { SettingsShell } from "../settings-shell";
import { SalesRegionSettings } from "../sales-region-settings";

export default async function CompanyInformationSettingsPage({ searchParams }: { searchParams?: Promise<{ kakao?: string }> }) {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const [company, loginMethods, params] = await Promise.all([
    getCompanySettings(session.companyId, session.companyName),
    getAppUserLoginMethods(session.userId || ""),
    searchParams
  ]);
  return (
    <SettingsShell activePath="/dashboard/settings/company" session={session} showHoldModules={showHoldModules} subtitle="회사 정보, 출발지와 알림 기준을 관리합니다." title="회사 정보">
      {session.userId ? <MyAccountLoginCard kakao={loginMethods.kakao} loginId={loginMethods.loginId} status={params?.kakao} /> : null}
      <CompanyProfileForm />
      <CompanySettingsForm initial={company} showHoldModules={showHoldModules} />
      <SalesRegionSettings />
      {showHoldModules ? <SalesKpiSettingsPanel canManage={customerHasCapability(session, "manage_company")} /> : null}
    </SettingsShell>
  );
}
