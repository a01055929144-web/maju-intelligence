import { supabaseRequest } from "@/lib/store";
import { KOREAN_ADMINISTRATIVE_AREAS, KOREAN_GENERAL_GU_AREAS } from "../korean-administrative-areas";
import { matchOrderDeliveryArea } from "../../domains/order/delivery-eligibility";

export type DeliveryEligibility={eligible:boolean;reason:string;territoryId?:string;territoryName?:string;weekdays:number[];baseAddress?:string;addressDetail?:string};
const blocked=(reason:string):DeliveryEligibility=>({eligible:false,reason,weekdays:[]});
export function storeAddressVerificationEnabled(companyId:string) {
  return process.env.STORE_ORDER_ADDRESS_VERIFICATION_ENABLED==="true" &&
    (process.env.FEATURE_STORE_ORDER_ADDRESS_VERIFICATION_COMPANY_IDS||"").split(",").some(id=>id.trim()===companyId);
}
// Keep reading until an empty page: a server row cap must not hide a second matching area.
async function allRows<T>(path:string,ceiling:number):Promise<T[]> {
  const rows:T[]=[];
  while(rows.length<=ceiling){
    const page=await supabaseRequest<T[]>(`${path}&limit=500&offset=${rows.length}`);
    if(!page.length)return rows;
    rows.push(...page);
  }
  throw new Error("delivery_configuration_too_large");
}
/** Shared by the storefront read and immediately before order RPC. All inputs are server scopes. */
export async function getStoreDeliveryEligibility(companyId:string,customerId:string):Promise<DeliveryEligibility> {
  if(!storeAddressVerificationEnabled(companyId))return blocked("verification_unavailable");
  const company=encodeURIComponent(companyId),customer=encodeURIComponent(customerId);
  try {
    const [customers,territories,areas,customerRules,settings]=await Promise.all([
      supabaseRequest<Array<{delivery_base_address:string|null;delivery_address_detail:string|null;delivery_territory_id:string|null}>>(`normalized_customers?company_id=eq.${company}&id=eq.${customer}&select=delivery_base_address,delivery_address_detail,delivery_territory_id&limit=1`),
      allRows<{id:string;name:string;is_active:boolean}>(`delivery_territories?company_id=eq.${company}&is_active=eq.true&select=id,name,is_active&order=id.asc`,1000),
      allRows<{territory_id:string;administrative_area:string}>(`delivery_territory_areas?company_id=eq.${company}&select=territory_id,administrative_area&order=territory_id.asc,administrative_area.asc`,10000),
      supabaseRequest<Array<{delivery_weekdays:number[]|null}>>(`store_order_customer_rules?company_id=eq.${company}&customer_id=eq.${customer}&select=delivery_weekdays&limit=1`),
      supabaseRequest<Array<{company_id:string}>>(`store_order_settings?company_id=eq.${company}&select=company_id&limit=1`)
    ]);
    const saved=customers[0],base=saved?.delivery_base_address?.trim(),detail=saved?.delivery_address_detail?.trim();
    if(!base||!detail)return blocked("address_unknown");
    const match=matchOrderDeliveryArea(base,territories.filter(t=>t.is_active).map(t=>({...t,areas:areas.filter(a=>a.territory_id===t.id).map(a=>a.administrative_area)})),KOREAN_ADMINISTRATIVE_AREAS,KOREAN_GENERAL_GU_AREAS);
    if(!match.eligible)return blocked(match.reason);
    if(saved.delivery_territory_id!==match.territory.id)return blocked("territory_link_required");
    const rules=await supabaseRequest<Array<{delivery_weekdays:number[]|null}>>(`store_order_territory_rules?company_id=eq.${company}&territory_id=eq.${encodeURIComponent(match.territory.id)}&select=delivery_weekdays&limit=1`);
    const days=customerRules[0]?.delivery_weekdays??rules[0]?.delivery_weekdays;
    if(!days?.length||days.length>7||days.some(d=>!Number.isInteger(d)||d<0||d>6))return blocked("weekdays_unconfigured");
    if(!settings.length)return blocked("order_settings_unconfigured");
    return {eligible:true,reason:"eligible",territoryId:match.territory.id,territoryName:match.territory.name,weekdays:days,baseAddress:base,addressDetail:detail};
  }catch{return blocked("verification_unavailable");}
}
