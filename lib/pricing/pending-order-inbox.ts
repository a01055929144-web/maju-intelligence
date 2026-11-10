import "server-only";
import { supabaseRequest } from "../store";
import { pendingDeliveryEnabled } from "./pending-delivery-feature";
import { isFeatureEnabled } from "../feature-flags";

export function pendingOrderInboxEnabled(companyId:string) {
  return process.env.STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED === "true" && pendingDeliveryEnabled(companyId) && isFeatureEnabled("PRICING",companyId);
}
export async function listPendingOrders(companyId:string,page:number) {
  const rows=await supabaseRequest<Array<{id:string;customer_id:string;submitted_at:string;known_total:number;revision:number;status:string}>>(
    `store_orders?company_id=eq.${encodeURIComponent(companyId)}&delivery_confirmation=eq.pending&status=in.(submitted,received)&select=id,customer_id,submitted_at,known_total,revision,status&order=submitted_at.asc,id.asc&limit=26&offset=${(page-1)*25}`);
  const items=rows.slice(0,25);
  if (!items.length) return {items:[],hasMore:false,page};
  const customers=Array.from(new Set(items.map(r=>r.customer_id)));
  const [names,lines]=await Promise.all([
    supabaseRequest<Array<{id:string;customer_name:string}>>(`normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${customers.join(",")})&select=id,customer_name&limit=25`),
    supabaseRequest<Array<{order_id:string;product_name:string;quantity:number;sales_unit:string}>>(`store_order_lines?company_id=eq.${encodeURIComponent(companyId)}&order_id=in.(${items.map(r=>r.id).join(",")})&select=order_id,product_name,quantity,sales_unit&order=id.asc&limit=2500`)
  ]);
  return {items:items.map(r=>({id:r.id,revision:r.revision,submittedAt:r.submitted_at,knownTotal:r.known_total,
    customerName:names.find(n=>n.id===r.customer_id)?.customer_name || "거래처 확인 필요",
    lines:lines.filter(l=>l.order_id===r.id).map(l=>({name:l.product_name,quantity:l.quantity,unit:l.sales_unit}))})),hasMore:rows.length>25,page};
}
export async function confirmPendingOrder(input:{companyId:string;memberId:string;userId:string;orderId:string;requestId:string;expectedRevision:number;deliveryDate:string|null;action:"confirm"|"cancel"}) {
  return supabaseRequest<{id:string;deliveryDate:string|null;revision:number;action:string}>("rpc/resolve_pending_order_delivery_09",{method:"POST",body:JSON.stringify({
    p_company_id:input.companyId,p_order_id:input.orderId,p_actor_member_id:input.memberId,p_actor_user_id:input.userId,
    p_request_id:input.requestId,p_expected_revision:input.expectedRevision,p_delivery_date:input.deliveryDate,p_action:input.action
  })});
}
