export function orderListExportEnabled(companyId: string) {
  return process.env.ORDER_LIST_EXPORT_ENABLED === "true"
    && (process.env.FEATURE_ORDER_LIST_EXPORT_COMPANY_IDS || "")
      .split(",")
      .some((id) => id.trim() === companyId);
}
