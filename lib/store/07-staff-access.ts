import { supabaseRequest } from "../store";
import { normalizeStaffDuties, type StaffDuty } from "../../domains/organization/staff-access";

export async function getStaffAccessState(input: { companyId: string; userId: string }): Promise<{
  active: boolean;
  duties: StaffDuty[];
}> {
  if (process.env.STAFF_ACCESS_V2_ENABLED !== "true") return { active: true, duties: [] };
  const rows = await supabaseRequest<Array<{ duties: unknown; membership_expires_at: string | null; permission_role: string | null }>>(
    `company_members?select=duties,permission_role,membership_expires_at&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  if (!member) return { active: false, duties: [] };
  const expired = member.permission_role === "temporary" && member.membership_expires_at && new Date(member.membership_expires_at).getTime() <= Date.now();
  return { active: !expired, duties: normalizeStaffDuties(member.duties) };
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
