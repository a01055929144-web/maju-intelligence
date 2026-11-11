import { priceSheetsEnabled } from "./pricing/feature";
import { storeOrderingEnabled } from "./pricing/store-order-feature";

export const companyFeatures = [
  "PRICING", "STORE_ORDERING", "ACCOUNT_LOGIN_V2", "DISTRIBUTOR_SALES", "MARGIN_TEMPLATES",
  "CUSTOMER_ITEMS_IMPORT", "PRODUCT_IMPORT_AUDIT_V2", "IMPORT_ROW_EDITOR",
  "PRODUCT_IMPORT_TARGETS", "COMPANY_FIELD_DEFINITIONS", "PRODUCT_CATEGORIES", "STORE_COSTS", "STAGE_D_ORDER_IDS", "STAGE_D_ORDER_COMPLETION"
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
