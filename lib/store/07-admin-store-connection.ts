import { createHash, randomBytes } from "crypto";
import { supabaseRequest } from "../store";
import { isFeatureEnabled } from "../feature-flags";
import { getStorePublicBaseUrl } from "./07-store-owner-provisioning";

// CX-144 U0: MAJU 관리자의 매장 연결 관리. 기본 OFF + 회사 allowlist(ADMIN_STORE_CONNECTION). 고객사 세션은 쓸 수 없다.
export function adminStoreConnectionEnabled(companyId: string) {
  return isFeatureEnabled("ADMIN_STORE_CONNECTION", companyId);
}
const q = encodeURIComponent;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const adminActorKey = (email: string) => createHash("sha256").update(`maju-admin:${email.trim().toLowerCase()}`).digest("hex");

export type AdminStoreMember = { id: string; role: string; status: string; name: string; phone: string | null; joinedAt: string | null };

export async function listAdminStoreConnection(companyId: string, storeAccountId: string) {
  const accounts = await supabaseRequest<Array<{ id: string; status: string; customer_id: string }>>(
    `store_accounts?company_id=eq.${q(companyId)}&id=eq.${q(storeAccountId)}&select=id,status,customer_id&limit=1`);
  const account = accounts[0];
  if (!account) return null;
  const members = await supabaseRequest<Array<{ id: string; role: string; status: string; joined_at: string | null; app_users: { name: string | null; phone: string | null } | null }>>(
    `store_account_members?company_id=eq.${q(companyId)}&store_account_id=eq.${q(storeAccountId)}&status=in.(active,invited)` +
    `&select=id,role,status,joined_at,app_users(name,phone)&order=joined_at.asc.nullslast&limit=50`);
  return { storeAccountId: account.id, status: account.status, customerId: account.customer_id,
    members: members.map((member): AdminStoreMember => ({ id: member.id, role: member.role, status: member.status,
      name: member.app_users?.name || "이름 없음", phone: member.app_users?.phone ?? null, joinedAt: member.joined_at })) };
}

/** 관리자 감사 키는 이메일 해시만 이벤트에 남긴다. */
export async function adminCloseStore(input: { companyId: string; storeAccountId: string; adminKey: string }) {
  return supabaseRequest("rpc/admin_change_store_connection_v1", { method: "POST", body: JSON.stringify({
    p_company_id: input.companyId, p_store_account_id: input.storeAccountId, p_admin_key: input.adminKey, p_action: "close" }) });
}
export async function adminRemoveMember(input: { companyId: string; storeAccountId: string; memberId: string; adminKey: string }) {
  return supabaseRequest("rpc/admin_change_store_connection_v1", { method: "POST", body: JSON.stringify({
    p_company_id: input.companyId, p_store_account_id: input.storeAccountId, p_member_id: input.memberId, p_admin_key: input.adminKey, p_action: "remove_member" }) });
}
/** 점주 추가: 기존 activation 경로(`/store/activate#토큰`)를 재사용하는 카카오 초대 링크를 발급한다. */
export async function adminInviteOwner(input: { companyId: string; customerId: string; adminKey: string }) {
  const origin = getStorePublicBaseUrl();
  if (!origin) throw new Error("store_public_base_url_unavailable");
  const token = randomBytes(32).toString("base64url");
  const prepared = await supabaseRequest<{ expiresAt: string }>("rpc/admin_prepare_store_owner_activation_v1", { method: "POST", body: JSON.stringify({
    p_company_id: input.companyId, p_customer_id: input.customerId, p_admin_key: input.adminKey, p_invite_token_hash: hashToken(token) }) });
  return { activationUrl: `${origin}/store/activate#${token}`, expiresAt: prepared.expiresAt };
}
