import { redirect } from "next/navigation";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getCustomerSession } from "@/lib/auth";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "../settings-form";
import { SettingsShell } from "../settings-shell";

/** 11/3: 문자 발신 정보는 고급 설정 옆 '문자 발송' 탭. 실제 문자 발송은 추후 엽니다. */
export default async function MessagingSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const company = await getCompanySettings(session.companyId, session.companyName);
  return (
    <SettingsShell activePath="/dashboard/settings/messaging" session={session} showHoldModules={showHoldModules} subtitle="문자를 보낼 때 점주에게 보이는 정보입니다. 문자 발송은 추후 열립니다." title="문자 발송">
      <CompanySettingsForm hideAside initial={company} sections={["messagingSender", "telegram"]} showHoldModules={showHoldModules} />
    </SettingsShell>
  );
}
