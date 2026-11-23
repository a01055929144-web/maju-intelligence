/** Deployment opt-in only; SQL approval/application must precede activation. */
export const PRICE_SHEETS_ENABLED = false;
export function priceSheetsEnabled(value = process.env.PRICE_SHEETS_ENABLED) {
  return value === "true";
}

export { documentOrderFooterEnabled } from "./document-order-footer-feature";
/** CX-128 A: disabled until a company is explicitly allowlisted. */
export function documentQrDisplayEnabled(companyId: string) {
  return Boolean(companyId) && (process.env.FEATURE_DOCUMENT_QR_DISPLAY_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
