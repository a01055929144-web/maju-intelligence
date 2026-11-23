import { isId } from "../../domains/pricing/document";

/** No company is enabled by default; activation belongs to the control tower. */
export function documentShareBrandingEnabled(companyId?: string) {
  const companies = (process.env.DOCUMENT_SHARE_BRANDING_COMPANY_IDS || "").split(",").map(value => value.trim()).filter(isId);
  return companyId ? companies.includes(companyId) : companies.length > 0;
}
