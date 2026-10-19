import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getBusinessNumberExceptions, getCompanySettings } from "@/lib/store";
import { BusinessNumberExceptionsPanel } from "../business-number-exceptions-panel";
import { CompanyClosurePanel } from "../company-closure-panel";
import { SettingsShell } from "../settings-shell";

export default async function AdvancedSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (session.workspaceRole !== "owner") redirect("/dashboard/settings/company");
  const [company, businessNumberExceptions] = await Promise.all([
    getCompanySettings(session.companyId, session.companyName),
    getBusinessNumberExceptions(session.companyId).catch(() => ({ exceptions: [], persisted: false }))
  ]);
  return (
    <SettingsShell activePath="/dashboard/settings/advanced" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="사업자번호 예외와 회사 이용 종료를 관리합니다." title="고급 설정">
      <BusinessNumberExceptionsPanel initialExceptions={businessNumberExceptions.exceptions} />
      <CompanyClosurePanel companyName={company.name} />
    </SettingsShell>
  );
}
