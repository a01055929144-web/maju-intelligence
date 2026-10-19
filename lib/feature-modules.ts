export const HOLD_MODULE_PATH_PREFIXES = [
  "/assistant",
  "/crm",
  "/operations",
  "/purchasing",
  "/reports",
  "/revenue",
  "/sales/performance"
] as const;

export function getHoldModulesEnabledCompanyIds(value = process.env.HOLD_MODULES_ENABLED_COMPANY_IDS || "") {
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}

export function areHoldModulesEnabled(companyId?: string | null, value?: string) {
  return Boolean(companyId && getHoldModulesEnabledCompanyIds(value).has(companyId));
}

export function isHoldModulePath(pathname: string) {
  if (pathname === "/revenue/contacts") return false;
  return HOLD_MODULE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isLeadBusinessHoursDraftEnabled(value = process.env.NEXT_PUBLIC_LEAD_BUSINESS_HOURS_UI_ENABLED || "") {
  return value !== "false" && value !== "0";
}

export const CORE_LEADS_HREF = "/dashboard?view=leads&leadType=permit";
