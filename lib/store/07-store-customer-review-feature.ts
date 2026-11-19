export function storeCustomerReviewEnabled(companyId?: string | null) {
  if (process.env.CUSTOMER_STORE_REVIEW_ENABLED !== "true" || !companyId) return false;
  return (process.env.FEATURE_CUSTOMER_STORE_REVIEW_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
