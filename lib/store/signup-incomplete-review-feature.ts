export function signupIncompleteReviewEnabled(companyId: string) {
  return process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_ENABLED === "true" && Boolean(companyId) &&
    (process.env.STORE_SIGNUP_INCOMPLETE_REVIEW_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
