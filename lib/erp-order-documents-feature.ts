import { isFeatureEnabled } from "./feature-flags";

export function erpOrderDocumentsEnabled(companyId?: string | null) {
  return isFeatureEnabled("ERP_ORDER_DOCUMENTS", companyId);
}
