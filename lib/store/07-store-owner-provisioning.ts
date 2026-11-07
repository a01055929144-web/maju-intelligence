import "server-only";

import { createHash } from "crypto";
import { supabaseRequest } from "../store";

export const STORE_TERMS_VERSION = "2026-11-07";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type PreparedStoreOwnerActivation = {
  companyId: string;
  customerId: string;
  storeAccountId: string;
  businessRegistrationNumber: string;
};

export async function prepareStoreOwnerActivation(input: {
  companyId: string; customerId: string; actorCompanyMemberId: string; token: string;
}) {
  return supabaseRequest<{ customerId: string; storeAccountId: string; expiresAt: string }>("rpc/prepare_store_owner_activation_v1", {
    method: "POST",
    body: JSON.stringify({ p_actor_company_member_id: input.actorCompanyMemberId, p_company_id: input.companyId,
      p_customer_id: input.customerId, p_invite_token_hash: hashToken(input.token) })
  });
}

export async function getPreparedStoreOwnerActivation(token: string): Promise<PreparedStoreOwnerActivation | null> {
  const requests = await supabaseRequest<Array<{ company_id: string; customer_id: string; store_account_id: string }>>(
    `store_owner_activation_requests?select=company_id,customer_id,store_account_id&invite_token_hash=eq.${hashToken(token)}&consumed_at=is.null&cancelled_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
  );
  const request = requests[0];
  if (!request) return null;
  const customers = await supabaseRequest<Array<{ business_registration_number: string | null }>>(
    `normalized_customers?select=business_registration_number&company_id=eq.${request.company_id}&id=eq.${request.customer_id}&limit=1`
  );
  const businessRegistrationNumber = (customers[0]?.business_registration_number || "").replace(/\D/g, "");
  return businessRegistrationNumber.length === 10 ? { companyId: request.company_id, customerId: request.customer_id,
    storeAccountId: request.store_account_id, businessRegistrationNumber } : null;
}

export async function resolveOrCreateStoreKakaoUser(input: {
  avatarUrl?: string; email?: string; kakaoUserId: string; name?: string; phoneNumber?: string;
}) {
  const existing = await supabaseRequest<Array<{ id: string; status: string }>>(
    `app_users?select=id,status&kakao_user_id=eq.${encodeURIComponent(input.kakaoUserId)}&limit=1`
  );
  if (existing[0]) return existing[0].status === "active" ? existing[0].id : null;
  const rows = await supabaseRequest<Array<{ id: string }>>("app_users?on_conflict=kakao_user_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ auth_provider: "kakao", avatar_url: input.avatarUrl || null,
      email: input.email || `kakao-${input.kakaoUserId}@maju.local`, kakao_user_id: input.kakaoUserId,
      last_login_at: new Date().toISOString(), name: input.name?.trim() || "매장 점주",
      phone: input.phoneNumber?.replace(/^\+82\s?/, "0").replace(/\D/g, "") || null,
      role: "customer_member", status: "active" }])
  });
  return rows[0]?.id || null;
}

export async function activateStoreOwner(input: {
  authUserId: string; businessRegistrationNumber: string; token: string; termsAcceptedAt: string;
  verificationRequestId: string; verifiedAt: string;
}) {
  return supabaseRequest<{ companyId: string; ownerMemberId: string; storeAccountId: string }>("rpc/activate_store_owner_v1", {
    method: "POST",
    body: JSON.stringify({ p_auth_user_id: input.authUserId, p_business_registration_number: input.businessRegistrationNumber,
      p_business_status: "active", p_invite_token_hash: hashToken(input.token), p_terms_accepted_at: input.termsAcceptedAt,
      p_terms_version: STORE_TERMS_VERSION, p_verification_request_id: input.verificationRequestId, p_verified_at: input.verifiedAt })
  });
}
