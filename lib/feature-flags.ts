import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";

export type CompanyFeature = "PRICING" | "STORE_ORDERING";

/** A company must be explicitly listed as well as passing the deployment gate. */
export function isFeatureEnabled(feature: CompanyFeature, companyId?: string | null): boolean {
  if (!companyId) return false;
  const enabled = feature === "PRICING" ? priceSheetsEnabled() : priceSheetsEnabled() && storeOrderingEnabled();
  if (!enabled) return false;
  const ids = feature === "PRICING"
    ? process.env.FEATURE_PRICING_COMPANY_IDS
    : process.env.FEATURE_STORE_ORDERING_COMPANY_IDS;
  return (ids || "").split(",").some((id) => id.trim() === companyId);
}
