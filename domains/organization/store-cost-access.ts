export const STORE_ACCOUNT_ROLES = ["owner", "manager", "staff"] as const;
export type StoreAccountRole = (typeof STORE_ACCOUNT_ROLES)[number];
export type StoreCostAction = "read" | "manage";

export function isStoreAccountRole(value: unknown): value is StoreAccountRole {
  return STORE_ACCOUNT_ROLES.some((role) => role === value);
}

export function canAccessStoreCosts(role: StoreAccountRole, action: StoreCostAction) {
  return action === "read" || role === "owner" || role === "manager";
}
