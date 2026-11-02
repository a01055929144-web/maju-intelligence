import { priceSheetsEnabled } from "./pricing/feature";
import { storeOrderingEnabled } from "./pricing/store-order-feature";

/** Deployment prerequisites remain separate from company rollout. */
export function isFeatureEnabled(feature: string, companyId?: string | null): boolean {
  if (feature === "PRICING" && !priceSheetsEnabled()) return false;
  if (feature === "STORE_ORDERING" && (!priceSheetsEnabled() || !storeOrderingEnabled())) return false;
  if (process.env[`FEATURE_${feature}`] === "true") return true;
  return !!companyId && (process.env[`FEATURE_${feature}_COMPANY_IDS`] || "")
    .split(",").some((id) => id.trim() === companyId);
}
