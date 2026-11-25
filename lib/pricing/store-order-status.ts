import "server-only";
import { supabaseRequest } from "../store";
import { getStoreDeliveryEligibility, storeAddressVerificationEnabled } from "./store-delivery-eligibility";
import { deliveryBlockGuide, deliveryEligibilityMessage } from "../../domains/order/delivery-eligibility";

const q = encodeURIComponent;
export type StoreOrderStatus = { orderable: boolean; reason: string; headline: string; message: string };

/**
 * CX-145 P1-3: 고객사 화면(거래처 상세)에 "이 매장은 왜 주문이 안 되는지"를 보여 주는 읽기 전용 사유.
 * 매장 주문 화면과 같은 규칙: 주소 확인이 켜진 회사는 getStoreDeliveryEligibility, 아니면 거래처 → 권역 → 회사 기본 배송 요일.
 */
export async function readStoreOrderStatus(companyId: string, customerId: string): Promise<StoreOrderStatus> {
  let reason = "eligible";
  if (storeAddressVerificationEnabled(companyId)) {
    const eligibility = await getStoreDeliveryEligibility(companyId, customerId);
    if (!eligibility.eligible) reason = eligibility.reason;
  } else {
    const [customers, rules, profiles] = await Promise.all([
      supabaseRequest<Array<{ delivery_territory_id: string | null }>>(`normalized_customers?select=delivery_territory_id&company_id=eq.${q(companyId)}&id=eq.${q(customerId)}&limit=1`),
      supabaseRequest<Array<{ delivery_weekdays: number[] | null }>>(`store_order_customer_rules?select=delivery_weekdays&company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&limit=1`),
      supabaseRequest<Array<{ delivery_weekdays: number[] | null }>>(`company_profiles?select=delivery_weekdays&company_id=eq.${q(companyId)}&limit=1`).catch(() => []),
    ]);
    const territory = customers[0]?.delivery_territory_id
      ? await supabaseRequest<Array<{ delivery_weekdays: number[] | null }>>(`store_order_territory_rules?select=delivery_weekdays&company_id=eq.${q(companyId)}&territory_id=eq.${q(customers[0].delivery_territory_id)}&limit=1`)
      : [];
    const weekdays = rules[0]?.delivery_weekdays ?? territory[0]?.delivery_weekdays ?? profiles[0]?.delivery_weekdays ?? [];
    if (!weekdays.length) reason = "weekdays_unconfigured";
  }
  if (reason === "eligible") return { orderable: true, reason, headline: "주문할 수 있습니다", message: "" };
  return { orderable: false, reason, headline: deliveryBlockGuide(reason).headline, message: deliveryEligibilityMessage(reason) };
}
