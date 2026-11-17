export function erpOrderDocumentsEnabled(companyId?: string | null) {
  if (process.env.ERP_ORDER_DOCUMENTS !== "true" || !companyId) return false;
  return (process.env.ERP_ORDER_DOCUMENTS_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}

/** Keep the draft-on-receipt contract off until the approved SQL and dispatch are verified. */
export function orderReceiptDraftEnabled(companyId: string) {
  return Boolean(companyId) && (process.env.FEATURE_ORDER_RECEIPT_DRAFT_COMPANY_IDS || "")
    .split(",").some(id => id.trim() === companyId);
}
