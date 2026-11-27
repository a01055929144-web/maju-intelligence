import { deliveryGuide, type HolidayRule } from "@/domains/order/order-rules";
import type { DocumentScope } from "@/application/pricing/documents";
import { DocumentSendError } from "@/domains/pricing/document-send";
import { documentOrderFooterEnabled } from "./document-order-footer-feature";
import type { PublicOrderFooter } from "@/domains/pricing/document-order-footer";
import { orderFooterNotice } from "@/domains/pricing/document-order-footer";
import { supabaseRequest } from "@/lib/store";
import { getStoreDeliveryEligibility, storeAddressVerificationEnabled } from "./store-delivery-eligibility";

type Rule = { cutoff_days_before?: number | null; cutoff_time?: string | null; delivery_weekdays?: number[] | null };
export async function readDocumentOrderFooter(scope: Pick<DocumentScope, "companyId" | "orderFooterEnabled">, customerId?: string, now = new Date()) {
  if (!scope.orderFooterEnabled) throw new DocumentSendError("주문 설정 표시를 사용할 수 없습니다.", 404);
  const company = encodeURIComponent(scope.companyId);
  const settings = await supabaseRequest<Rule[]>(
    `store_order_settings?company_id=eq.${company}&select=cutoff_days_before,cutoff_time&limit=1`);
  let territory: Rule = {}, customer: Rule = {}, weekdays: number[] | null | undefined;
  let territoryId: string | null | undefined;
  let verified: Awaited<ReturnType<typeof getStoreDeliveryEligibility>> | undefined;
  if (customerId) {
    const id = encodeURIComponent(customerId);
    const rows = await supabaseRequest<Array<{ delivery_territory_id: string | null }>>(
      `normalized_customers?company_id=eq.${company}&id=eq.${id}&select=delivery_territory_id&limit=1`);
    if (!rows[0]) throw new DocumentSendError("같은 회사의 매장을 확인해 주세요.", 404);
    if (storeAddressVerificationEnabled(scope.companyId)) verified = await getStoreDeliveryEligibility(scope.companyId, customerId);
    territoryId = verified ? verified.territoryId : rows[0].delivery_territory_id;
    const [customerRules, territoryRules] = await Promise.all([
      supabaseRequest<Rule[]>(`store_order_customer_rules?company_id=eq.${company}&customer_id=eq.${id}&select=cutoff_days_before,cutoff_time,delivery_weekdays&limit=1`),
      territoryId ? supabaseRequest<Rule[]>(`store_order_territory_rules?company_id=eq.${company}&territory_id=eq.${encodeURIComponent(territoryId)}&select=cutoff_days_before,cutoff_time,delivery_weekdays&limit=1`) : Promise.resolve([]),
    ]);
    customer = customerRules[0] ?? {}; territory = territoryRules[0] ?? {};
    weekdays = verified ? verified.eligible ? verified.weekdays : [] : customer.delivery_weekdays ?? territory.delivery_weekdays;
    if (weekdays == null) {
      const profiles = await supabaseRequest<Array<{ delivery_weekdays: number[] | null }>>(`company_profiles?company_id=eq.${company}&select=delivery_weekdays&limit=1`);
      weekdays = profiles[0]?.delivery_weekdays ?? [];
    }
  }
  // Same missing-row defaults and independent null coalescing as readStorefront/order RPC.
  const before = customer.cutoff_days_before ?? territory.cutoff_days_before ?? settings[0]?.cutoff_days_before ?? 1;
  const time = (customer.cutoff_time ?? territory.cutoff_time ?? settings[0]?.cutoff_time ?? "22:00:00").slice(0, 5);
  if ((before !== 0 && before !== 1 && before !== 2) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new DocumentSendError("주문 설정을 확인해 주세요.", 503);
  const info = orderFooterNotice("");
  info[0].value = customerId ? "배송 설정 확인 필요" : `배송 ${before === 0 ? "당일" : before + "일 앞"} ${time} (권역·매장별 예외)`;
  if (customerId && weekdays?.length) {
    const holidayRows = await supabaseRequest<Array<{ kind: "weekly" | "fixed" | "date"; weekday: number | null; month: number | null; day: number | null; holiday_date: string | null }>>(
      `store_order_holidays?company_id=eq.${company}&${territoryId ? "or=(territory_id.is.null,territory_id.eq." + encodeURIComponent(territoryId) + ")" : "territory_id=is.null"}&select=kind,weekday,month,day,holiday_date&limit=200`);
    const holidays = holidayRows.map((item): HolidayRule => item.kind === "weekly" ? { kind: "weekly", weekday: item.weekday! }
      : item.kind === "fixed" ? { kind: "fixed", month: item.month!, day: item.day! } : { kind: "date", date: item.holiday_date! });
    info[0].value = deliveryGuide({ weekdays, cutoffDaysBefore: before, cutoffTime: time,
      holidays, minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, now).text;
  }
  info[1].value = !customerId ? "권역·매장별 확인" : weekdays?.length && weekdays.length <= 7 && weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    ? Array.from(new Set(weekdays)).sort((a,b) => a-b).map(day => ["일","월","화","수","목","금","토"][day]).join("·") : "배송 설정 확인 필요";
  return info;
}

/** Caller must first validate the public token/company/expiry/revocation boundary. */
export async function readPublicDocumentOrderFooter(companyId: string): Promise<PublicOrderFooter | undefined> {
  if (!documentOrderFooterEnabled(companyId)) return undefined;
  try { return { status: "available", items: await readDocumentOrderFooter({ companyId, orderFooterEnabled: true }) }; }
  catch { return { status: "unavailable" }; }
}
