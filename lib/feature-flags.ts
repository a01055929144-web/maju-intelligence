import { priceSheetsEnabled } from "./pricing/feature";
import { storeOrderingEnabled } from "./pricing/store-order-feature";

export const companyFeatures = [
  "PRICING", "STORE_ORDERING", "ACCOUNT_LOGIN_V2", "DISTRIBUTOR_SALES", "MARGIN_TEMPLATES", "PROMOTION_AUDIENCE", "STORE_GRADES", "STORE_CATALOG_LINK", "COMPANY_LINK_UNIFY", "STORE_RELATION_HOME", "STORE_SIGNUP_LINK",
  "CUSTOMER_ITEMS_IMPORT", "PRODUCT_IMPORT_AUDIT_V2", "IMPORT_ROW_EDITOR",
  "PRODUCT_IMPORT_TARGETS", "COMPANY_FIELD_DEFINITIONS", "PRODUCT_CATEGORIES", "COMMON_CATEGORY_MAPPING", "STORE_COSTS", "STAGE_D_ORDER_IDS", "STAGE_D_ORDER_COMPLETION",
  "STORE_PRICE_SEARCH", "PARTNER_REGISTRATION", "PRICE_EXPLANATION", "NEW_STORE_CUSTOMER_REVIEW",
  "STORE_BUSINESS_IDENTITY", "STORE_PROFILE_DELIVERY", "STORE_PROFILE_INVITATIONS", "STORE_SETTLEMENT_ACCOUNT", "LEAD_VISIT_MATERIALS",
  "LEAD_SEMAS_ENRICH", "LEAD_VISIT_NEEDED_PRIORITY", "LEAD_NEW_STORE_PRIORITY", "ADMIN_STORE_MANAGEMENT", "STORE_PROFILE_SETTINGS", "DRIVER_SALES_STOPS", "STORE_ORDER_HISTORY", "ROUTE_SALES_STOPS", "ERP_ORDER_DOCUMENTS", "PARTNER_PAYMENTS", "STORE_RECEIVED_DOCUMENTS_HOME", "DRIVER_RECEIPT_WORKFLOW", "DRIVER_RUN_EXPERIENCE", "DELIVERY_ORDER_PHOTOS", "FIELD_RECORDS"
] as const;
export type CompanyFeature = (typeof companyFeatures)[number];

const legacyGlobalFlags: Partial<Record<CompanyFeature, string>> = {
  ACCOUNT_LOGIN_V2: "ACCOUNT_LOGIN_V2_ENABLED",
  CUSTOMER_ITEMS_IMPORT: "CUSTOMER_ITEMS_IMPORT_ENABLED",
  PRODUCT_IMPORT_AUDIT_V2: "PRODUCT_IMPORT_AUDIT_V2_ENABLED",
  IMPORT_ROW_EDITOR: "IMPORT_ROW_EDITOR_ENABLED",
  PRODUCT_IMPORT_TARGETS: "PRODUCT_IMPORT_TARGETS_ENABLED",
  COMPANY_FIELD_DEFINITIONS: "COMPANY_FIELD_DEFINITIONS_ENABLED",
  PRODUCT_CATEGORIES: "PRODUCT_CATEGORIES_ENABLED",
  MARGIN_TEMPLATES: "MARGIN_TEMPLATES_ENABLED"
};

/** Existing global switches keep their current behavior while company rollout is introduced. */
export function isFeatureEnabled(feature: CompanyFeature, companyId?: string | null): boolean {
  if (feature === "PRICING" && !priceSheetsEnabled()) return false;
  if (feature === "STORE_ORDERING" && (!priceSheetsEnabled() || !storeOrderingEnabled())) return false;
  const legacy = legacyGlobalFlags[feature];
  const globalEnabled = process.env[`FEATURE_${feature}`] === "true" || (legacy && process.env[legacy] === "true");
  if (feature === "ACCOUNT_LOGIN_V2") return Boolean(globalEnabled); // Company is unknown before login.
  if (globalEnabled) return true;
  return !!companyId && (process.env[`FEATURE_${feature}_COMPANY_IDS`] || "")
    .split(",").some((id) => id.trim() === companyId);
}

export function hasFeatureRollout(feature: CompanyFeature): boolean {
  return isFeatureEnabled(feature) || Boolean((process.env[`FEATURE_${feature}_COMPANY_IDS`] || "")
    .split(",").some((id) => id.trim()));
}
