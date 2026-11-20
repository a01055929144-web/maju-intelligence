export function storeOrderDetailEnabled(companyId: string) {
  return Boolean(companyId) && process.env.STORE_ORDER_DETAIL_ENABLED === "true" &&
    (process.env.STORE_ORDER_DETAIL_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
