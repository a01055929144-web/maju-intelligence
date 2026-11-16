export function erpOrderDocumentsEnabled(companyId?: string | null) {
  if (process.env.ERP_ORDER_DOCUMENTS !== "true" || !companyId) return false;
  return (process.env.ERP_ORDER_DOCUMENTS_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
