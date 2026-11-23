export function documentExtensionEnabled(companyId: string) {
  return Boolean(companyId) && process.env.PRICING_DOCUMENT_EXTENSION_ENABLED === "true" &&
    (process.env.PRICING_DOCUMENT_EXTENSION_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
