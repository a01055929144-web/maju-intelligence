/** New-price editing only. Existing publication snapshots keep their stored meaning. */
export function documentVatEnabled(companyId: string) {
  return process.env.PRICING_DOCUMENT_VAT_ENABLED === "true" && Boolean(companyId) &&
    (process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(companyId);
}
