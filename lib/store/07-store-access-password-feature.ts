const enabledCompanies = () => new Set(
  (process.env.FEATURE_STORE_ACCESS_PASSWORD_READ_COMPANY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isStoreAccessPasswordReadEnabled(companyId: string) {
  return process.env.STORE_ACCESS_PASSWORD_READ_ENABLED === "true"
    && enabledCompanies().has(companyId);
}
