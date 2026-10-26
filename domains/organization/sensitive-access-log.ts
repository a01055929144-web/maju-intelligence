export const SENSITIVE_ACCESS_ITEMS = ["access_password", "owner_phone", "business_registration", "export", "log_hidden"] as const;
export type SensitiveAccessItem = (typeof SENSITIVE_ACCESS_ITEMS)[number];

export const SENSITIVE_ACCESS_WARNING_CODES = ["unassigned", "outside_work_session", "daily_20_plus", "export"] as const;
export type SensitiveAccessWarningCode = (typeof SENSITIVE_ACCESS_WARNING_CODES)[number];

export type SensitiveAccessLog = {
  accessedAt: string;
  actorName: string;
  actorRole: string;
  deviceLabel: string;
  hiddenAt: string | null;
  id: string;
  item: SensitiveAccessItem;
  pagePath: string;
  storeName: string;
  warningCodes: SensitiveAccessWarningCode[];
};

export type SensitiveAccessLogFilters = {
  from?: string;
  includeHidden?: boolean;
  item?: SensitiveAccessItem;
  query?: string;
  role?: string;
  to?: string;
  userId?: string;
  warning?: SensitiveAccessWarningCode;
};

export function authorizeSensitiveAccessLogRead(input: { hasActiveCustomerSession: boolean; isActiveCompanyOwner: boolean }) {
  if (!input.hasActiveCustomerSession) return "unauthorized" as const;
  if (!input.isActiveCompanyOwner) return "forbidden" as const;
  return "allowed" as const;
}

export function isOwnerMembershipRole(input: { legacyRole?: string | null; permissionRole?: string | null }) {
  return input.permissionRole != null ? input.permissionRole === "owner" : input.legacyRole === "owner";
}

export function normalizeSensitiveAccessItem(value: unknown): SensitiveAccessItem | undefined {
  return SENSITIVE_ACCESS_ITEMS.find((item) => item === value);
}

export function normalizeSensitiveAccessWarning(value: unknown): SensitiveAccessWarningCode | undefined {
  return SENSITIVE_ACCESS_WARNING_CODES.find((warning) => warning === value);
}
