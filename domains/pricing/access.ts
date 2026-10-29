/** Source workspace role takes precedence over the legacy owner/member label. */
export function canManagePriceSheets(session: { workspaceRole?: string; role?: string } | null) {
  const role = session?.workspaceRole ?? session?.role;
  return role === "owner" || role === "manager";
}
