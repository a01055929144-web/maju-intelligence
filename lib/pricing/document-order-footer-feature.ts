/** CX-129: display-only; disabled until a company is explicitly listed. */
export function documentOrderFooterEnabled(companyId: string) {
  return Boolean(companyId) && (process.env.FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
