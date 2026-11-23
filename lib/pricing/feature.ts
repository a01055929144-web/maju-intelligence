/** Deployment opt-in only; SQL approval/application must precede activation. */
export const PRICE_SHEETS_ENABLED = false;
export function priceSheetsEnabled(value = process.env.PRICE_SHEETS_ENABLED) {
  return value === "true";
}

/** CX-129: display-only; disabled until a company is explicitly listed. */
export function documentOrderFooterEnabled(companyId: string) {
  return Boolean(companyId) && (process.env.FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
/** CX-128 A: disabled until a company is explicitly allowlisted. */
export function documentQrDisplayEnabled(companyId: string) {
  return Boolean(companyId) && (process.env.FEATURE_DOCUMENT_QR_DISPLAY_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
