export type AppUserRole = "maju_super_admin" | "maju_operator" | "customer_user";
export type WorkspaceType = "personal" | "company";
export type WorkspaceRole = "owner" | "manager" | "sales" | "driver" | "member";

export type WorkspaceCapability =
  | "manage_company"
  | "manage_members"
  | "manage_customers"
  | "manage_routes"
  | "manage_sales"
  | "view_reports"
  | "capture_field_updates"
  | "manage_billing";

export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
  driver: "배송기사",
  manager: "관리자",
  member: "직원",
  owner: "대표/소유자",
  sales: "영업직원"
};

export const workspaceTypeLabels: Record<WorkspaceType, string> = {
  company: "회사 워크스페이스",
  personal: "개인 워크스페이스"
};

// Roles are mostly used for display, filtering, and manager-side organization rather than
// blocking day-to-day work. The exceptions (added 2026-08-26, P1 "직원 초대 권한 세분화" and
// 2026-09-01 결제 기능 추가): manage_members — inviting, editing, or deactivating other staff —
// and manage_billing —카드 등록/변경, 결제 이력 조회 — are limited to owner/manager, since both
// touch either 계정 구성 or 돈이 오가는 부분이라 일반 직원(영업/배송기사)까지 열어둘 이유가 없습니다.
// All other capabilities stay open to every role, matching the existing product direction.
const roleCapabilities: Record<WorkspaceRole, WorkspaceCapability[]> = {
  owner: allWorkspaceCapabilities(),
  manager: allWorkspaceCapabilities(),
  sales: allWorkspaceCapabilities().filter((capability) => capability !== "manage_members" && capability !== "manage_billing"),
  driver: allWorkspaceCapabilities().filter((capability) => capability !== "manage_members" && capability !== "manage_billing"),
  member: allWorkspaceCapabilities().filter((capability) => capability !== "manage_members" && capability !== "manage_billing")
};

export function normalizeWorkspaceRole(role?: string | null): WorkspaceRole {
  if (role === "owner" || role === "manager" || role === "sales" || role === "driver" || role === "member") return role;
  return "member";
}

export function getWorkspaceCapabilities(role?: string | null): WorkspaceCapability[] {
  return roleCapabilities[normalizeWorkspaceRole(role)];
}

export function canUseWorkspaceFeature(role: string | null | undefined, capability: WorkspaceCapability) {
  return getWorkspaceCapabilities(role).includes(capability);
}

function allWorkspaceCapabilities(): WorkspaceCapability[] {
  return [
    "manage_company",
    "manage_members",
    "manage_customers",
    "manage_routes",
    "manage_sales",
    "view_reports",
    "capture_field_updates",
    "manage_billing"
  ];
}
