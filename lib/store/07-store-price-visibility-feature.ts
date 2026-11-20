const enabledCompanies = () => new Set((process.env.FEATURE_STORE_PRICE_VISIBILITY_COMPANY_IDS || "")
  .split(",").map(value => value.trim()).filter(Boolean));

/** CX-122 stays off unless both the global switch and the company allowlist permit it. */
export function isStorePriceVisibilityEnabled(companyId?: string | null) {
  return process.env.STORE_PRICE_VISIBILITY_ENABLED === "true" && Boolean(companyId && enabledCompanies().has(companyId));
}
