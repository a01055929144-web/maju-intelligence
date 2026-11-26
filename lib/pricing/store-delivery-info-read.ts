import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { missingDeliveryInfo, type MissingDeliveryInfo } from "../../domains/order/delivery-info";

// CX-152: 읽기 전용(저장은 lib/store/07-store-delivery-info.ts). 매장 화면·고객사 화면이 같이 쓴다.
const q = encodeURIComponent;
export const flagsFor = (companyId: string) => {
  const profile = isFeatureEnabled("STORE_PROFILE_SETTINGS", companyId);
  return { profile, receiveMethod: profile && isFeatureEnabled("STORE_PROFILE_DELIVERY", companyId) };
};

export type DeliveryInfoRead = {
  baseAddress: string; addressDetail: string; accessNote: string; deliveryContactPhone: string; receiveMethod: string;
  /** 값은 절대 내보내지 않는다 — 있음/없음만. */
  hasAccessPassword: boolean; hasProfile: boolean; required: { profile: boolean; receiveMethod: boolean }; missing: MissingDeliveryInfo[];
};

/** 거래처(customer) 기준으로 배송 정보와 빠진 항목을 읽는다. 주소는 normalized_customers, 나머지는 store_profiles. */
export async function readCustomerDeliveryInfo(companyId: string, customerId: string): Promise<DeliveryInfoRead> {
  const required = flagsFor(companyId);
  const [customers, accounts] = await Promise.all([
    supabaseRequest<Array<{ delivery_base_address: string | null; delivery_address_detail: string | null }>>(
      `normalized_customers?select=delivery_base_address,delivery_address_detail&company_id=eq.${q(companyId)}&id=eq.${q(customerId)}&limit=1`),
    required.profile ? supabaseRequest<Array<{ store_profile_id: string | null; store_profiles: {
      access_note: string | null; delivery_contact_phone: string | null; receive_method?: string | null; access_password_updated_at?: string | null } | null }>>(
      `store_accounts?select=store_profile_id,store_profiles(access_note,delivery_contact_phone${required.receiveMethod ? ",receive_method,access_password_updated_at" : ""})` +
      `&company_id=eq.${q(companyId)}&customer_id=eq.${q(customerId)}&status=eq.active&limit=1`).catch(() => []) : Promise.resolve([]),
  ]);
  const profile = accounts[0]?.store_profiles ?? null;
  const out = {
    baseAddress: customers[0]?.delivery_base_address?.trim() || "", addressDetail: customers[0]?.delivery_address_detail?.trim() || "",
    accessNote: profile?.access_note?.trim() || "", deliveryContactPhone: profile?.delivery_contact_phone?.trim() || "",
    receiveMethod: profile?.receive_method || "", hasAccessPassword: Boolean(profile?.access_password_updated_at), hasProfile: Boolean(profile), required,
  };
  return { ...out, missing: missingDeliveryInfo({ ...out, profile: profile ? out : null, required }) };
}

