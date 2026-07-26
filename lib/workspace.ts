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
  | "capture_field_updates";

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

const roleCapabilities: Record<WorkspaceRole, WorkspaceCapability[]> = {
  owner: allWorkspaceCapabilities(),
  manager: allWorkspaceCapabilities(),
  sales: allWorkspaceCapabilities(),
  driver: allWorkspaceCapabilities(),
  member: allWorkspaceCapabilities()
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
  return ["manage_company", "manage_members", "manage_customers", "manage_routes", "manage_sales", "view_reports", "capture_field_updates"];
}
