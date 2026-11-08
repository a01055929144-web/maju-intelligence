import { isFeatureEnabled } from "../feature-flags";
import { isId } from "../../domains/pricing/document";
import { documentSharingEnabled } from "./document-share-feature";

export function quoteAcceptanceEnabled(companyId?: string) {
  if (process.env.QUOTE_ACCEPTANCE !== "true") return false;
  const companies = (process.env.QUOTE_ACCEPTANCE_COMPANY_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(isId);
  if (!companies.length || !documentSharingEnabled(companyId)) return false;
  if (!companyId) return companies.some((id) =>
    isFeatureEnabled("PRICING", id) && isFeatureEnabled("STORE_ORDERING", id));
  return companies.includes(companyId) && isFeatureEnabled("PRICING", companyId) &&
    isFeatureEnabled("STORE_ORDERING", companyId);
}
