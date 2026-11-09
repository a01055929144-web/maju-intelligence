import { publicOwnerTestAccessAllowed } from "./public-owner-test-mode";

export function isStoreMemberCompanyAllowlisted(companyId: string) {
  return Boolean(companyId) && publicOwnerTestAccessAllowed(companyId) && (process.env.FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS || "")
    .split(",")
    .some(id => id.trim() === companyId);
}
