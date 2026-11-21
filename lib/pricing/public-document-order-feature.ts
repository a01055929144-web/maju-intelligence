import { documentSharingEnabled } from "./document-share-feature";
import { isFeatureEnabled } from "../feature-flags";
import { isStoreMemberCompanyAllowlisted } from "../store/07-store-member-feature";

/** Recipient-free share DDL and 07 signup contract must be approved separately. */
export function publicDocumentOrderEntryEnabled(companyId?: string) {
  return process.env.PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED === "true" && documentSharingEnabled(companyId);
}

/** Sharing readiness alone never enables signup or order entry. */
export function publicDocumentSignupEnabled(companyId: string) {
  return publicDocumentOrderEntryEnabled(companyId) && process.env.STORE_PUBLIC_OWNER_ONBOARDING_ENABLED === "true" &&
    (process.env.FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId) &&
    process.env.STORE_MEMBER_SESSION_ENABLED === "true" && isStoreMemberCompanyAllowlisted(companyId) &&
    (process.env.STORE_OWNER_ONBOARDING_SECRET?.length ?? 0) >= 32 && isFeatureEnabled("STORE_ORDERING", companyId);
}

/** The public shopping layout rolls out only to explicitly listed issuers. */
export function publicDocumentShoppingEnabled(companyId: string) {
  return (process.env.FEATURE_PUBLIC_DOCUMENT_SHOPPING_COMPANY_IDS || "")
    .split(",").some(id => id.trim() === companyId);
}

/** CX-93 stays OFF until expiry and first-order policy rollout is approved for the issuer. */
export function publicDocumentOrderGuidanceEnabled(companyId: string) {
  return process.env.PUBLIC_DOCUMENT_ORDER_GUIDANCE_ENABLED === "true" && documentSharingEnabled(companyId) &&
    (process.env.FEATURE_PUBLIC_DOCUMENT_ORDER_GUIDANCE_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
