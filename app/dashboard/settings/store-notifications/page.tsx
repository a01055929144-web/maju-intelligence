import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { SettingsShell } from "../settings-shell";
import { StoreNotificationSettings } from "@/components/store-notification-settings";

export default async function StoreNotificationsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (!isFeatureEnabled("STORE_PROFILE_SETTINGS", session.companyId)) redirect("/dashboard/settings/company");
  return <SettingsShell activePath="/dashboard/settings/store-notifications" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)}
    subtitle="새 매장을 확인하고 바뀐 매장 정보를 거래처에 반영합니다." title="매장 알림"><StoreNotificationSettings /></SettingsShell>;
}
