import type { DocumentScope } from "@/application/pricing/documents";
import { DocumentSendError } from "@/domains/pricing/document-send";
import { orderFooterNotice } from "@/domains/pricing/document-order-footer";
import { supabaseRequest } from "@/lib/store";
import { getStoreDeliveryEligibility, storeAddressVerificationEnabled } from "./store-delivery-eligibility";

type Rule = { cutoff_days_before?: number | null; cutoff_time?: string | null; delivery_weekdays?: number[] | null };
export async function readDocumentOrderFooter(scope: DocumentScope, customerId?: string) {
  if (!scope.orderFooterEnabled) throw new DocumentSendError("주문 설정 표시를 사용할 수 없습니다.", 404);
  const company = encodeURIComponent(scope.companyId);
  const settings = await supabaseRequest<Rule[]>(
    `store_order_settings?company_id=eq.${company}&select=cutoff_days_before,cutoff_time&limit=1`);
  let territory: Rule = {}, customer: Rule = {}, weekdays: number[] | null | undefined;
  let verified: Awaited<ReturnType<typeof getStoreDeliveryEligibility>> | undefined;
  if (customerId) {
    const id = encodeURIComponent(customerId);
    const rows = await supabaseRequest<Array<{ delivery_territory_id: string | null }>>(
      `normalized_customers?company_id=eq.${company}&id=eq.${id}&select=delivery_territory_id&limit=1`);
    if (!rows[0]) throw new DocumentSendError("같은 회사의 매장을 확인해 주세요.", 404);
    if (storeAddressVerificationEnabled(scope.companyId)) verified = await getStoreDeliveryEligibility(scope.companyId, customerId);
    const territoryId = verified ? verified.territoryId : rows[0].delivery_territory_id;
    const [customerRules, territoryRules] = await Promise.all([
      supabaseRequest<Rule[]>(`store_order_customer_rules?company_id=eq.${company}&customer_id=eq.${id}&select=cutoff_days_before,cutoff_time,delivery_weekdays&limit=1`),
      territoryId ? supabaseRequest<Rule[]>(`store_order_territory_rules?company_id=eq.${company}&territory_id=eq.${encodeURIComponent(territoryId)}&select=cutoff_days_before,cutoff_time,delivery_weekdays&limit=1`) : Promise.resolve([]),
    ]);
    customer = customerRules[0] ?? {}; territory = territoryRules[0] ?? {};
    weekdays = verified ? verified.eligible ? verified.weekdays : [] : customer.delivery_weekdays ?? territory.delivery_weekdays;
  }
  // Same missing-row defaults and independent null coalescing as readStorefront/order RPC.
  const before = customer.cutoff_days_before ?? territory.cutoff_days_before ?? settings[0]?.cutoff_days_before ?? 1;
  const time = (customer.cutoff_time ?? territory.cutoff_time ?? settings[0]?.cutoff_time ?? "22:00:00").slice(0, 5);
  if (![0, 1, 2].includes(before) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new DocumentSendError("주문 설정을 확인해 주세요.", 503);
  const info = orderFooterNotice("");
  info[0].value = `${["당일", "전날", "2일 전"][before]} ${time}${customerId ? "" : " (권역·매장별 예외)"}`;
  info[1].value = !customerId ? "권역·매장별 확인" : weekdays?.length && weekdays.length <= 7 && weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    ? [...new Set(weekdays)].sort((a,b) => a-b).map(day => ["일","월","화","수","목","금","토"][day]).join("·") : "배송 설정 확인 필요";
  return info;
}
