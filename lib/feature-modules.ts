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

export const CORE_LEADS_HREF = "/leads?type=permit";

export function resolveLegacyDashboardHref(params: { companyId?: string; leadType?: string; view?: string }) {
  const companyQuery = params.companyId ? `companyId=${encodeURIComponent(params.companyId)}` : "";
  if (params.view === "leads") {
    const type = params.leadType === "keyword" ? "keyword" : "permit";
    return `/leads?type=${type}${companyQuery ? `&${companyQuery}` : ""}`;
  }
  const view = params.view === "history" || params.view === "course" || params.view === "customers" ? params.view : "";
  const query = [view ? `view=${view}` : "", companyQuery].filter(Boolean).join("&");
  return `/map${query ? `?${query}` : ""}`;
}
