import { supabaseRequest } from "./00-core";

export type SalesAreaDeliverySyncStatus = {
  conflictAreas: string[];
  defaultTerritoryId: string | null;
  disabledAreas: string[];
  missingAreas: string[];
  syncedAreas: string[];
};

export async function getSalesAreaDeliverySyncStatus(companyId: string) {
  return supabaseRequest<SalesAreaDeliverySyncStatus>("rpc/sales_area_delivery_sync_status_v1", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId })
  });
}

export async function syncSalesAreasToDefaultDeliveryTerritory(companyId: string) {
  return supabaseRequest<SalesAreaDeliverySyncStatus>("rpc/sync_sales_areas_to_default_delivery_territory_v1", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId })
  });
}

export async function setSalesAreaDeliveryDisabled(companyId: string, regionId: string, disabled: boolean) {
  return supabaseRequest<SalesAreaDeliverySyncStatus>("rpc/set_sales_area_delivery_disabled_v1", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId, p_disabled: disabled, p_region_id: regionId })
  });
}
