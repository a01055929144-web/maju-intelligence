export function businessDocumentCancellationEnabled(companyId?: string | null) {
  if (process.env.BUSINESS_DOCUMENT_CANCELLATION_ENABLED !== "true" || !companyId) return false;
  return (process.env.BUSINESS_DOCUMENT_CANCELLATION_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
