import { isFeatureEnabled } from "../feature-flags";

export function pendingDeliveryEnabled(companyId: string) {
  return process.env.STORE_ORDER_PENDING_DELIVERY_ENABLED === "true" &&
    (process.env.STORE_ORDER_PENDING_DELIVERY_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId) &&
    isFeatureEnabled("STORE_ORDERING", companyId);
}
