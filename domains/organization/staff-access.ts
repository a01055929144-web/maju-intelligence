export const STAFF_DUTIES = ["sales", "delivery"] as const;
export type StaffDuty = (typeof STAFF_DUTIES)[number];

export const STAFF_PERMISSION_ROLES = ["owner", "manager", "staff", "temporary"] as const;
export type StaffPermissionRole = (typeof STAFF_PERMISSION_ROLES)[number];

export const STAFF_DUTY_LABELS: Record<StaffDuty, string> = {
  sales: "영업",
  delivery: "배송"
};

export const STAFF_PERMISSION_LABELS: Record<StaffPermissionRole, string> = {
  owner: "대표",
  manager: "관리자",
  staff: "직원",
  temporary: "알바(임시)"
};

export function normalizeStaffDuties(value: unknown): StaffDuty[] {
  if (!Array.isArray(value)) return [];
  return STAFF_DUTIES.filter((duty) => value.includes(duty));
}

export function normalizeStaffPermissionRole(value: unknown): StaffPermissionRole {
  if (value === "owner" || value === "manager" || value === "temporary") return value;
  return "staff";
}

export function legacyRoleToStaffAccess(role?: string | null): {
  duties: StaffDuty[];
  permissionRole: StaffPermissionRole;
} {
  if (role === "owner") return { duties: ["sales", "delivery"], permissionRole: "owner" };
  if (role === "manager") return { duties: ["sales", "delivery"], permissionRole: "manager" };
  if (role === "driver") return { duties: ["delivery"], permissionRole: "staff" };
  if (role === "sales") return { duties: ["sales"], permissionRole: "staff" };
  return { duties: [], permissionRole: "staff" };
}

export function getDefaultTemporaryExpiry(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  return expiresAt.toISOString().slice(0, 10);
}

export function validateStaffAccess(input: {
  duties: StaffDuty[];
  permissionRole: StaffPermissionRole;
  expiresOn?: string | null;
}) {
  if (!input.duties.length) return "영업 또는 배송 업무를 하나 이상 선택해주세요.";
  if (input.permissionRole === "temporary" && !input.expiresOn) return "알바(임시)는 만료일이 필요합니다.";
  return null;
}

export function resolveMobileStaffLanding(input: { duties: StaffDuty[]; hasTodayRoute: boolean }) {
  if (input.duties.length === 1) return input.duties[0] === "delivery" ? "/mobile/today" : "/mobile/sales";
  if (input.duties.includes("delivery") && input.hasTodayRoute) return "/mobile/today";
  return "/mobile/sales";
}

export function canGrantStaffPermission(actor: "maju_admin" | StaffPermissionRole, nextRole: StaffPermissionRole) {
  if (nextRole !== "owner") return actor === "maju_admin" || actor === "owner" || actor === "manager";
  return actor === "maju_admin" || actor === "owner";
}

export function canChangeStaffPermission(
  actor: "maju_admin" | StaffPermissionRole,
  currentRole: StaffPermissionRole,
  nextRole: StaffPermissionRole
) {
  if (currentRole === "owner" && actor !== "owner" && actor !== "maju_admin") return false;
  return canGrantStaffPermission(actor, nextRole);
}
