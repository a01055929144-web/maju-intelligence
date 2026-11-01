import type { WorkspaceCapability } from "@/lib/workspace";

export const ROLE_PERMISSION_KEYS = [
  "pc_access",
  "sales_leads_map",
  "quotes_prices",
  "cost_prices",
  "orders_fulfillment",
  "delivery_app",
  "vouchers_money",
  "customer_contacts",
  "manage_staff_permissions",
  "export_data"
] as const;

export type RolePermissionKey = (typeof ROLE_PERMISSION_KEYS)[number];
export type RoleGroupKey = "owner" | "manager" | "sales" | "delivery" | "field_sales" | "accounting";

export const ROLE_PERMISSION_LABELS: Record<RolePermissionKey, string> = {
  pc_access: "PC 화면 접근",
  sales_leads_map: "영업 · 리드 · 지도",
  quotes_prices: "견적서 · 단가표 작성",
  cost_prices: "단가 · 매입가 보기",
  orders_fulfillment: "주문관리 · 출고 준비",
  delivery_app: "배송 앱",
  vouchers_money: "매입 · 매출 · 입출금",
  customer_contacts: "거래처 연락처 전체 보기",
  manage_staff_permissions: "직원 · 권한 변경",
  export_data: "엑셀 내려받기"
};

export const ROLE_GROUPS: Record<RoleGroupKey, { label: string; mobileOnly?: boolean; permissions: RolePermissionKey[] }> = {
  owner: { label: "대표", permissions: [...ROLE_PERMISSION_KEYS] },
  manager: { label: "관리자", permissions: [...ROLE_PERMISSION_KEYS] },
  sales: { label: "영업", permissions: ["pc_access", "sales_leads_map", "quotes_prices", "cost_prices", "customer_contacts", "export_data"] },
  delivery: { label: "배송", permissions: ["orders_fulfillment", "delivery_app", "customer_contacts"] },
  field_sales: { label: "필드 영업(모바일만)", mobileOnly: true, permissions: ["sales_leads_map", "quotes_prices", "cost_prices", "customer_contacts"] },
  accounting: { label: "경리 (돈 관리)", permissions: ["pc_access", "cost_prices", "vouchers_money", "export_data"] }
};

export function isRoleGroupKey(value: unknown): value is RoleGroupKey {
  return typeof value === "string" && value in ROLE_GROUPS;
}

export function normalizeRolePermissionOverrides(value: unknown): Partial<Record<RolePermissionKey, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    ROLE_PERMISSION_KEYS.flatMap((key) => typeof (value as Record<string, unknown>)[key] === "boolean" ? [[key, (value as Record<string, boolean>)[key]]] : [])
  );
}

export function resolveRolePermissions(groupKey: RoleGroupKey, overrides: Partial<Record<RolePermissionKey, boolean>> = {}) {
  const defaults = new Set(ROLE_GROUPS[groupKey].permissions);
  return ROLE_PERMISSION_KEYS.filter((key) => overrides[key] ?? defaults.has(key));
}

const CAPABILITY_PERMISSIONS: Record<WorkspaceCapability, RolePermissionKey> = {
  capture_field_updates: "sales_leads_map",
  manage_billing: "vouchers_money",
  manage_company: "manage_staff_permissions",
  manage_customers: "sales_leads_map",
  manage_members: "manage_staff_permissions",
  manage_routes: "orders_fulfillment",
  manage_sales: "sales_leads_map",
  view_company_operations: "pc_access",
  view_reports: "vouchers_money"
};

export function rolePermissionsAllowCapability(permissions: RolePermissionKey[], capability: WorkspaceCapability) {
  return permissions.includes(CAPABILITY_PERMISSIONS[capability]);
}
