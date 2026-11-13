import "server-only";

import { supabaseRequest } from "../store";
import { STORE_TERMS_VERSION, type ParsedStoreProfile } from "../../domains/store/store-profile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StoreProfileSummary = {
  id: string;
  storeName: string;
  role: "owner" | "manager" | "staff";
  businessStatus: string;
  baseAddress: string | null;
};

export { storeDirectSignupEnabled } from "./11-direct-signup-flag";

/** 프로필과 점주 구성원 1명을 한 번에 만든다(DB 함수 create_store_profile_v1). 사업자번호가 겹쳐도 합치지 않는다. */
export async function createStoreProfile(authUserId: string, input: ParsedStoreProfile) {
  if (!UUID.test(authUserId)) throw new Error("store_profile_user_invalid");
  return supabaseRequest<{ storeProfileId: string; memberId: string }>("rpc/create_store_profile_v1", {
    method: "POST",
    body: JSON.stringify({
      p_auth_user_id: authUserId, p_store_name: input.storeName, p_business_registration_number: input.businessRegistrationNumber ?? "",
      p_base_address: input.baseAddress, p_address_detail: input.addressDetail ?? "", p_terms_version: STORE_TERMS_VERSION, p_origin: "direct",
    }),
  });
}

/** 로그인한 사용자 본인의 활성 매장만. 다른 사람의 프로필·유통사는 조회하지 않는다. */
export async function listStoreProfiles(authUserId: string): Promise<StoreProfileSummary[]> {
  if (!UUID.test(authUserId)) return [];
  const rows = await supabaseRequest<Array<{ role: StoreProfileSummary["role"]; store_profiles: { id: string; store_name: string; business_status: string; base_address: string | null } | null }>>(
    `store_profile_members?select=role,store_profiles!inner(id,store_name,business_status,base_address)` +
    `&auth_user_id=eq.${encodeURIComponent(authUserId)}&status=eq.active&store_profiles.status=eq.active&order=joined_at.asc&limit=20`
  );
  return rows.flatMap((row) => row.store_profiles ? [{ id: row.store_profiles.id, storeName: row.store_profiles.store_name, role: row.role,
    businessStatus: row.store_profiles.business_status, baseAddress: row.store_profiles.base_address }] : []);
}

export type ConnectResult =
  | { ok: true; companyId: string; storeAccountId: string; alreadyLinked: boolean }
  | { ok: false; reason: "invalid_code" | "not_owner" };

/** 초대코드로 유통사에 연결(DB 함수 connect_store_profile_by_invite_code_v1). 없는/만료/회수 코드는 모두 invalid_code 하나로 합쳐 구분하지 않는다. */
export async function connectStoreProfile(authUserId: string, storeProfileId: string, codeHash: string): Promise<ConnectResult> {
  if (!UUID.test(authUserId) || !UUID.test(storeProfileId)) throw new Error("store_profile_ids_invalid");
  try {
    const result = await supabaseRequest<{ companyId: string; storeAccountId: string; alreadyLinked: boolean }>("rpc/connect_store_profile_by_invite_code_v1", {
      method: "POST", body: JSON.stringify({ p_auth_user_id: authUserId, p_store_profile_id: storeProfileId, p_code_hash: codeHash }),
    });
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("store_invite_code_invalid")) return { ok: false, reason: "invalid_code" };
    if (message.includes("store_profile_owner_required")) return { ok: false, reason: "not_owner" };
    throw error;
  }
}
