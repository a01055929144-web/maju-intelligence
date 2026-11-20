/** Editing entry only. Stored publication formatting remains visible when OFF. */
export function documentFooterFormattingEnabled(companyId: string) {
  return process.env.PRICING_DOCUMENT_FOOTER_FORMAT_ENABLED === "true" && Boolean(companyId) &&
    (process.env.PRICING_DOCUMENT_FOOTER_FORMAT_COMPANY_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(companyId);
}
