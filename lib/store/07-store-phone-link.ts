import "server-only";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { normalizeOwnerMobile } from "../../domains/store/owner-phone";
import { isStoreMemberCompanyAllowlisted } from "./07-store-member-feature";

// CX-146: 고객사가 거래처에 넣어 둔 '점주 휴대폰'과 카카오 번호가 같으면 확인 한 번으로 매장을 연결한다.
// 기본 OFF(FEATURE_STORE_PHONE_LINK_COMPANY_IDS 회사만). 번호 원문은 서버 안에서만 쓰고 화면·로그·응답에는 내보내지 않는다.

export type PhoneLinkCandidate = { companyId: string; customerId: string; customerName: string; addressHint: string; state: "linkable" | "owner_conflict" | "unavailable" };
type CandidateRow = { company_id: string; customer_id: string; customer_name: string | null; address_hint: string | null; state: PhoneLinkCandidate["state"] };

/** 회사별 allowlist만(전역 true는 회사 목록을 알 수 없어 인정하지 않는다). 세션 허용 회사와도 겹쳐야 한다. */
export function phoneLinkCompanyIds() {
  return (process.env.FEATURE_STORE_PHONE_LINK_COMPANY_IDS || "").split(",").map(id => id.trim())
    .filter(id => id && isFeatureEnabled("STORE_PHONE_LINK", id) && isStoreMemberCompanyAllowlisted(id));
}

const q = encodeURIComponent;

/** 이 번호를 점주 휴대폰으로 둔 거래처가 허용 회사에 있는지(사용자 계정을 만들기 전 확인). */
export async function phoneHasCustomerMatch(phone: string) {
  const companies = phoneLinkCompanyIds();
  if (!companies.length) return false;
  const rows = await supabaseRequest<Array<{ id: string }>>(
    `normalized_customers?select=id&owner_mobile=eq.${q(phone)}&company_id=in.(${companies.map(q).join(",")})&limit=1`);
  return rows.length > 0;
}

/** 로그인마다 카카오 번호를 app_users.phone에 갱신(유효한 010 번호일 때만, 값이 같으면 건너뜀). */
export async function refreshAppUserPhone(authUserId: string, phone: string) {
  await supabaseRequest(`app_users?id=eq.${q(authUserId)}&or=(phone.is.null,phone.neq.${q(phone)})`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ phone }) });
}

async function storedPhone(authUserId: string) {
  const rows = await supabaseRequest<Array<{ phone: string | null }>>(`app_users?select=phone&id=eq.${q(authUserId)}&status=eq.active&limit=1`);
  return normalizeOwnerMobile(rows[0]?.phone);
}

export async function listPhoneLinkCandidates(authUserId: string): Promise<PhoneLinkCandidate[]> {
  const companies = phoneLinkCompanyIds();
  const phone = companies.length ? await storedPhone(authUserId) : null;
  if (!companies.length || !phone) return [];
  const rows = await supabaseRequest<CandidateRow[]>("rpc/phone_link_candidates_v1", { method: "POST",
    body: JSON.stringify({ p_auth_user: authUserId, p_phone: phone, p_companies: companies }) });
  return rows.map(row => ({ companyId: row.company_id, customerId: row.customer_id, customerName: row.customer_name || "이름 없는 매장",
    addressHint: row.address_hint || "", state: row.state }));
}

/** 확인 연결. 선택한 거래처 중 서버가 다시 대조해 통과한 것만 연결한다(요청 값은 신뢰하지 않는다). */
export async function confirmPhoneLink(authUserId: string, customerIds: string[]) {
  const companies = phoneLinkCompanyIds();
  const phone = companies.length ? await storedPhone(authUserId) : null;
  if (!companies.length || !phone) return { linked: [] as Array<{ companyId: string; storeAccountId: string }>, conflicts: 0, skipped: 0 };
  return supabaseRequest<{ linked: Array<{ companyId: string; storeAccountId: string }>; conflicts: number; skipped: number }>("rpc/confirm_phone_link_v1", {
    method: "POST", body: JSON.stringify({ p_auth_user: authUserId, p_phone: phone, p_customer_ids: customerIds, p_companies: companies }) });
}

export async function declinePhoneLink(authUserId: string, customerIds: string[]) {
  const companies = phoneLinkCompanyIds();
  const phone = companies.length ? await storedPhone(authUserId) : null;
  if (!companies.length || !phone) return 0;
  return supabaseRequest<number>("rpc/decline_phone_link_v1", { method: "POST",
    body: JSON.stringify({ p_auth_user: authUserId, p_phone: phone, p_customer_ids: customerIds, p_companies: companies }) });
}
