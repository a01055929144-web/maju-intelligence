export function industryBasketsEnabled(companyId?: string | null) {
  if (process.env.INDUSTRY_BASKETS !== "true" || !companyId) return false;
  return (process.env.INDUSTRY_BASKETS_COMPANY_IDS || "").split(",").some((id) => id.trim() === companyId);
}
