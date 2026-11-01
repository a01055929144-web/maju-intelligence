import { supabaseRequest } from "../store";
import { normalizeStaffDuties, type StaffDuty } from "../../domains/organization/staff-access";
import { isRoleGroupKey, normalizeRolePermissionOverrides, resolveRolePermissions, type RoleGroupKey, type RolePermissionKey } from "../../domains/organization/role-settings";

export async function getStaffAccessState(input: { companyId: string; userId: string }): Promise<{
  active: boolean;
  duties: StaffDuty[];
  rolePermissionGroup: RoleGroupKey | null;
  rolePermissions: RolePermissionKey[];
}> {
  const staffAccessEnabled = process.env.STAFF_ACCESS_V2_ENABLED === "true";
  const roleSettingsEnabled = process.env.ROLE_PERMISSIONS_ENABLED === "true";
  if (!staffAccessEnabled && !roleSettingsEnabled) return { active: true, duties: [], rolePermissionGroup: null, rolePermissions: [] };
  const rows = await supabaseRequest<Array<{ duties: unknown; membership_expires_at: string | null; permission_group_key?: string | null; permission_overrides?: unknown; permission_role: string | null }>>(
    `company_members?select=duties,permission_role,membership_expires_at${roleSettingsEnabled ? ",permission_group_key,permission_overrides" : ""}&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  if (!member) return { active: false, duties: [], rolePermissionGroup: null, rolePermissions: [] };
  const expired = member.permission_role === "temporary" && member.membership_expires_at && new Date(member.membership_expires_at).getTime() <= Date.now();
  const groupKey = isRoleGroupKey(member.permission_group_key) ? member.permission_group_key : null;
  return {
    active: !expired,
    duties: normalizeStaffDuties(member.duties),
    rolePermissionGroup: groupKey,
    rolePermissions: groupKey ? resolveRolePermissions(groupKey, normalizeRolePermissionOverrides(member.permission_overrides)) : []
  };
}

export async function getStaffMobileAccess(input: {
  companyId: string;
  driverName?: string;
  userId: string;
}): Promise<{ duties: StaffDuty[]; hasTodayRoute: boolean }> {
  if (process.env.STAFF_ACCESS_V2_ENABLED !== "true") return { duties: [], hasTodayRoute: false };
  const [access, routes] = await Promise.all([
    getStaffAccessState(input),
    input.driverName
      ? supabaseRequest<Array<{ id: string }>>(
          `route_plan_confirmations?select=id&company_id=eq.${encodeURIComponent(input.companyId)}&route_date=eq.${encodeURIComponent(new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()))}&driver_name=eq.${encodeURIComponent(input.driverName)}&limit=1`
        ).catch(() => [])
      : Promise.resolve([])
  ]);
  if (!access.active) return { duties: [], hasTodayRoute: false };
  return { duties: access.duties, hasTodayRoute: routes.length > 0 };
}
