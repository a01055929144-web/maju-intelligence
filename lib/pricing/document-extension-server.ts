export function documentExtensionServerEnabled(companyId: string) {
  return process.env.PRICING_DOCUMENT_EXTENSION_ENABLED === "true" &&
    (process.env.PRICING_DOCUMENT_EXTENSION_COMPANY_IDS || "").split(",").map(value => value.trim()).includes(companyId);
}
