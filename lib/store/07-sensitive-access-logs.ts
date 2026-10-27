import {
  normalizeSensitiveAccessItem,
  normalizeSensitiveAccessWarning,
  isOwnerMembershipRole,
  isOutsideSensitiveWorkSession,
  type SensitiveAccessItem,
  type SensitiveAccessLog,
  type SensitiveAccessLogFilters,
  type SensitiveAccessWarningCode
} from "../../domains/organization/sensitive-access-log";
import { legacyRoleToStaffAccess, normalizeStaffDuties, normalizeStaffPermissionRole } from "../../domains/organization/staff-access";
import { canAccessAssignedCustomer, isCustomerOnTodayRouteForDriver, supabaseRequest, type CustomerAssignmentScope } from "../store";

type SensitiveAccessLogRow = {
  accessed_at: string;
  actor_name: string;
  actor_role: string;
  device_label: string | null;
  hidden_at: string | null;
  id: string;
  item_type: string;
  page_path: string;
  store_name: string | null;
  warning_codes: unknown;
};

export function sensitiveAccessLogsEnabled() {
  return process.env.SENSITIVE_ACCESS_LOGS_ENABLED === "true";
}

export async function isActiveCompanyOwner(input: { companyId: string; userId: string }) {
  const rows = await supabaseRequest<Array<{ permission_role: string | null; role: string | null }>>(
    `company_members?select=permission_role,role&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  return Boolean(member && isOwnerMembershipRole({ legacyRole: member.role, permissionRole: member.permission_role }));
}

export async function isActiveSensitiveAccessMember(input: { companyId: string; userId: string }) {
  const rows = await supabaseRequest<Array<{ membership_expires_at: string | null; permission_role: string | null }>>(
    `company_members?select=permission_role,membership_expires_at&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  if (!member) return false;
  return !(member.permission_role === "temporary" && member.membership_expires_at && new Date(member.membership_expires_at).getTime() <= Date.now());
}

export async function isActiveSensitiveAccessActor(input: { companyId: string; isLegacyOwner?: boolean; userId?: string }) {
  if (input.userId) return isActiveSensitiveAccessMember({ companyId: input.companyId, userId: input.userId });
  if (!input.isLegacyOwner) return false;
  const rows = await supabaseRequest<Array<{ status: string | null }>>(
    `companies?select=status&id=eq.${encodeURIComponent(input.companyId)}&limit=1`
  );
  return Boolean(rows[0] && (!rows[0].status || ["active", "fallback"].includes(rows[0].status)));
}

export async function isActiveSensitiveAccessOwner(input: { companyId: string; isLegacyOwner?: boolean; userId?: string }) {
  if (input.userId) return isActiveCompanyOwner({ companyId: input.companyId, userId: input.userId });
  return input.isLegacyOwner ? isActiveSensitiveAccessActor(input) : false;
}

function mapLog(row: SensitiveAccessLogRow): SensitiveAccessLog {
  return {
    accessedAt: row.accessed_at,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    deviceLabel: row.device_label || "알 수 없는 기기",
    hiddenAt: row.hidden_at,
    id: row.id,
    item: normalizeSensitiveAccessItem(row.item_type) || "access_password",
    pagePath: row.page_path,
    storeName: row.store_name || "매장 미지정",
    warningCodes: Array.isArray(row.warning_codes)
      ? row.warning_codes.map(normalizeSensitiveAccessWarning).filter((value): value is SensitiveAccessWarningCode => Boolean(value))
      : []
  };
}

export async function listSensitiveAccessLogs(companyId: string, filters: SensitiveAccessLogFilters = {}, page: { limit?: number; offset?: number } = {}) {
  const limit = Math.max(1, Math.min(500, Math.floor(page.limit || 200)));
  const offset = Math.max(0, Math.floor(page.offset || 0));
  const query = new URLSearchParams({
    select: "id,actor_name,actor_role,store_name,item_type,device_label,page_path,warning_codes,accessed_at,hidden_at",
    company_id: `eq.${companyId}`,
    order: "accessed_at.desc",
    limit: String(limit),
    offset: String(offset)
  });
  if (!filters.includeHidden) query.set("hidden_at", "is.null");
  if (filters.from) query.set("accessed_at", `gte.${filters.from}`);
  if (filters.to) query.append("accessed_at", `lte.${filters.to}`);
  if (filters.userId) query.set("actor_user_id", `eq.${filters.userId}`);
  if (filters.role) query.set("actor_role", `eq.${filters.role}`);
  if (filters.item) query.set("item_type", `eq.${filters.item}`);
  if (filters.warning) query.set("warning_codes", `cs.{${filters.warning}}`);
  const safeQuery = filters.query?.replace(/[(),*%]/g, " ").trim();
  if (safeQuery) query.set("or", `(actor_name.ilike.*${safeQuery}*,store_name.ilike.*${safeQuery}*,device_label.ilike.*${safeQuery}*)`);
  const rows = await supabaseRequest<SensitiveAccessLogRow[]>(`sensitive_access_logs?${query.toString()}`);
  return rows.map(mapLog);
}

export async function recordSensitiveAccessLog(input: {
  actorName: string;
  actorRole: string;
  actorKind?: "app_user" | "legacy_owner";
  actorUserId?: string;
  companyId: string;
  deviceLabel?: string;
  item: SensitiveAccessItem;
  pagePath: string;
  storeId?: string;
  storeName?: string;
  warningCodes?: SensitiveAccessWarningCode[];
}) {
  if (!sensitiveAccessLogsEnabled()) return false;
  const actorKind = input.actorKind || (input.actorUserId ? "app_user" : "legacy_owner");
  if (actorKind === "app_user" && !input.actorUserId) throw new Error("sensitive_access_actor_user_required");
  await supabaseRequest("sensitive_access_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ company_id: input.companyId, actor_user_id: input.actorUserId || null, actor_kind: actorKind, actor_name: input.actorName, actor_role: input.actorRole, store_id: input.storeId || null, store_name: input.storeName || null, item_type: input.item, device_label: input.deviceLabel || null, page_path: input.pagePath, warning_codes: input.warningCodes || [] }])
  });
  return true;
}

type RevealAccessPasswordResult =
  | { status: "allowed"; value: string | null }
  | { status: "forbidden" | "not_found" | "unauthorized" };

function kstDayStartIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+09:00`).toISOString();
}

export async function revealAccessPasswordForMember(input: {
  actorName: string;
  companyId: string;
  customerId: string;
  deviceLabel?: string;
  driverNames: string[];
  assignmentScope: CustomerAssignmentScope;
  isLegacyOwner?: boolean;
  userId?: string;
}): Promise<RevealAccessPasswordResult> {
  if (!sensitiveAccessLogsEnabled()) return { status: "forbidden" };

  const members = input.userId ? await supabaseRequest<Array<{
    duties: unknown;
    id: string;
    membership_expires_at: string | null;
    permission_role: string | null;
    role: string | null;
  }>>(
    `company_members?select=id,role,permission_role,duties,membership_expires_at&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  ) : [];
  const member = members[0] || (input.isLegacyOwner && await isActiveSensitiveAccessActor(input)
    ? { duties: ["sales", "delivery"], id: "", membership_expires_at: null, permission_role: "owner", role: "owner" }
    : null);
  if (!member) return { status: "unauthorized" };

  const permissionRole = member.permission_role
    ? normalizeStaffPermissionRole(member.permission_role)
    : legacyRoleToStaffAccess(member.role).permissionRole;
  const duties = member.permission_role ? normalizeStaffDuties(member.duties) : legacyRoleToStaffAccess(member.role).duties;
  if (permissionRole === "temporary" && member.membership_expires_at && new Date(member.membership_expires_at).getTime() <= Date.now()) {
    return { status: "unauthorized" };
  }

  const customers = await supabaseRequest<Array<{
    access_password: string | null;
    assigned_staff_member_id: string | null;
    customer_name: string;
    id: string;
  }>>(
    `normalized_customers?select=id,customer_name,access_password,assigned_staff_member_id&id=eq.${encodeURIComponent(input.customerId)}&company_id=eq.${encodeURIComponent(input.companyId)}&limit=1`
  );
  const customer = customers[0];
  if (!customer) return { status: "not_found" };

  const canOverrideAssignment = permissionRole === "owner" || permissionRole === "manager";
  const [hasAssignmentAccess, hasTodayRouteAccess] = canOverrideAssignment
    ? [true, false]
    : await Promise.all([
        canAccessAssignedCustomer(input.companyId, input.customerId, input.assignmentScope),
        isCustomerOnTodayRouteForDriver(input.companyId, input.customerId, input.driverNames)
      ]);
  if (!canOverrideAssignment && (!duties.includes("delivery") || (!hasAssignmentAccess && !hasTodayRouteAccess))) return { status: "forbidden" };

  const recentLogs = await supabaseRequest<Array<{ id: string }>>(
    `sensitive_access_logs?select=id&company_id=eq.${encodeURIComponent(input.companyId)}&${input.userId ? `actor_user_id=eq.${encodeURIComponent(input.userId)}` : "actor_kind=eq.legacy_owner"}&accessed_at=gte.${encodeURIComponent(kstDayStartIso())}&limit=20`
  );
  const warningCodes: SensitiveAccessWarningCode[] = [];
  if (canOverrideAssignment && customer.assigned_staff_member_id && customer.assigned_staff_member_id !== member.id) warningCodes.push("unassigned");
  if (!canOverrideAssignment && hasTodayRouteAccess && !hasAssignmentAccess) warningCodes.push("unassigned");
  if (isOutsideSensitiveWorkSession(permissionRole)) warningCodes.push("outside_work_session");
  if (recentLogs.length >= 19) warningCodes.push("daily_20_plus");

  // Fail closed: the value is returned only after the audit INSERT succeeds.
  const recorded = await recordSensitiveAccessLog({
    actorName: input.actorName,
    actorKind: input.userId ? "app_user" : "legacy_owner",
    actorRole: permissionRole,
    actorUserId: input.userId,
    companyId: input.companyId,
    deviceLabel: input.deviceLabel,
    item: "access_password",
    pagePath: "/customers/[id]/sensitive/access-password/reveal",
    storeId: customer.id,
    storeName: customer.customer_name,
    warningCodes
  });
  if (!recorded) return { status: "forbidden" };
  return { status: "allowed", value: customer.access_password };
}

export async function hideSensitiveAccessLog(input: { actorName: string; actorUserId?: string; companyId: string; logId: string }) {
  const now = new Date().toISOString();
  const rows = await supabaseRequest<Array<{ id: string }>>(`sensitive_access_logs?select=id&id=eq.${encodeURIComponent(input.logId)}&company_id=eq.${encodeURIComponent(input.companyId)}&hidden_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ hidden_at: now, hidden_by: input.actorUserId || null, hidden_by_actor_kind: input.actorUserId ? "app_user" : "legacy_owner", hidden_by_name: input.actorName })
  });
  return rows[0] ? now : null;
}
