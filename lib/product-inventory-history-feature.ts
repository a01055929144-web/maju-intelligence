import { isCiLayoutFixturesEnabled } from "./ci-layout-fixtures";

export function productInventoryHistoryEnabled(companyId?: string | null) {
  if (!companyId) return false;
  if (isCiLayoutFixturesEnabled()) return true;
  return (process.env.FEATURE_PRODUCT_INVENTORY_HISTORY_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
