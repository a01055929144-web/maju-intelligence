/** Separate activation requires the 02 snapshot DDL and approved 09 producer SQL. */
export function storeOrderDeliverySnapshotEnabled(companyId: string) {
  return Boolean(companyId) && process.env.STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED === "true" &&
    (process.env.STORE_ORDER_DELIVERY_COMPANY_IDS || "").split(",").map(id => id.trim()).includes(companyId);
}

export function storeOrderDeliveryCompletionEnabled() {
  return process.env.STORE_ORDER_DELIVERY_COMPLETION_ENABLED === "true";
}
