import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { isActiveSensitiveAccessOwner, listSensitiveAccessLogs, sensitiveAccessLogsEnabled } from "@/lib/store/07-sensitive-access-logs";
import { SettingsShell } from "../settings-shell";
import { SensitiveAccessLogPanel } from "./sensitive-access-log-panel";

export default async function SecuritySettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (!(await isActiveSensitiveAccessOwner({ companyId: session.companyId, isLegacyOwner: !session.userId && session.workspaceRole === "owner", userId: session.userId }))) redirect("/dashboard/settings/company");
  const enabled = sensitiveAccessLogsEnabled();
  const records = enabled ? await listSensitiveAccessLogs(session.companyId) : [];
  return (
    <SettingsShell activePath="/dashboard/settings/security" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="출입 비밀번호 등 민감정보를 누가 열람했는지 대표가 확인합니다." title="보안 기록">
      <SensitiveAccessLogPanel enabled={enabled} initialRecords={records} />
    </SettingsShell>
  );
}
