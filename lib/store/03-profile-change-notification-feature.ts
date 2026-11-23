export function storeProfileChangeNotificationsEnabled(companyId: string) {
  if (process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS !== "true") return false;
  return (process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
