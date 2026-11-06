import { priceSheetsEnabled } from "./feature";
import { isFeatureEnabled } from "../feature-flags";
import { isId } from "../../domains/pricing/document";

export function documentSharingEnabled(companyId?: string) {
  if (!priceSheetsEnabled() || process.env.LEAD_DOCUMENT_SHARING_ENABLED !== "true") return false;
  const companies = (process.env.LEAD_DOCUMENT_SHARING_COMPANY_IDS || "").split(",").map(s => s.trim()).filter(isId);
  if (!companies.length) return false;
  if (!companyId) return true;
  return companies.includes(companyId) && isFeatureEnabled("PRICING", companyId);
}
