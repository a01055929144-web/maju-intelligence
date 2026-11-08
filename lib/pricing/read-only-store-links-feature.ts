import { isId } from "../../domains/pricing/document";

/** Enable only after the read-only issuer SQL is approved, applied and verified. */
export function readOnlyStoreLinksEnabled(companyId: string) {
  return process.env.READ_ONLY_STORE_LINKS_ENABLED === "true" && isId(companyId) &&
    (process.env.READ_ONLY_STORE_LINKS_COMPANY_IDS || "").split(",").some(id => id.trim().toLowerCase() === companyId.toLowerCase());
}
