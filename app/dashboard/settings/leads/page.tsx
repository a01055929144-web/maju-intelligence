import { redirect } from "next/navigation";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled, isLeadWorkspaceV2Enabled } from "@/lib/feature-modules";
import { SettingsShell } from "../settings-shell";
import { LeadWorkspaceSettings } from "./workspace";

export default async function LeadWorkspaceSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (!isLeadWorkspaceV2Enabled(session.companyId)) redirect("/dashboard/settings/company");
  if (!customerHasCapability(session, "manage_customers")) redirect("/leads?type=permit");

  return (
    <SettingsShell activePath="/dashboard/settings/leads" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="리드 칸, 엑셀 가져오기와 유통사 대상을 준비합니다." title="리드 관리 설정">
      <LeadWorkspaceSettings />
    </SettingsShell>
  );
}
