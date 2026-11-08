import "server-only";

import { createHash, randomBytes } from "crypto";
import type { StoreAccountRole } from "../../domains/organization/store-cost-access";
import { supabaseRequest } from "../store";

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type PreparedStoreMemberInvitation = {
  companyId: string;
  memberId: string;
  role: Exclude<StoreAccountRole, "owner">;
  storeAccountId: string;
};

export async function createStoreMemberInvitation(input: {
  actorMemberId: string;
  companyId: string;
  role: Exclude<StoreAccountRole, "owner">;
  storeAccountId: string;
}) {
  const token = randomBytes(32).toString("base64url");
  await supabaseRequest("rpc/create_store_member_invitation_v1", {
    method: "POST",
    body: JSON.stringify({ p_actor_member_id: input.actorMemberId, p_company_id: input.companyId,
      p_invite_token_hash: hashToken(token), p_role: input.role, p_store_account_id: input.storeAccountId })
  });
  return token;
}

export async function getPreparedStoreMemberInvitation(token: string): Promise<PreparedStoreMemberInvitation | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const invitedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRequest<Array<{ company_id: string; id: string; role: string; store_account_id: string }>>(
    `store_account_members?select=id,company_id,store_account_id,role,store_accounts!inner(id)&invite_token_hash=eq.${hashToken(token)}&status=eq.invited&invited_at=gt.${encodeURIComponent(invitedAfter)}&store_accounts.status=eq.active&store_accounts.business_status=eq.active&limit=1`
  );
  const row = rows[0];
  if (!row || (row.role !== "manager" && row.role !== "staff")) return null;
  return { companyId: row.company_id, memberId: row.id, role: row.role, storeAccountId: row.store_account_id };
}

export async function acceptStoreMemberInvitation(input: {
  authUserId: string;
  companyId: string;
  storeAccountId: string;
  token: string;
}) {
  if (!INVITE_TOKEN.test(input.token)) throw new Error("store_invitation_invalid");
  return supabaseRequest<Record<string, unknown>>("rpc/accept_store_member_invitation_v1", {
    method: "POST",
    body: JSON.stringify({ p_auth_user_id: input.authUserId, p_company_id: input.companyId,
      p_invite_token_hash: hashToken(input.token), p_store_account_id: input.storeAccountId })
  });
}

export async function removeStoreMember(input: {
  actorMemberId: string;
  companyId: string;
  storeAccountId: string;
  targetMemberId: string;
}) {
  return supabaseRequest<Record<string, unknown>>("rpc/remove_store_member_v1", {
    method: "POST",
    body: JSON.stringify({ p_actor_member_id: input.actorMemberId, p_company_id: input.companyId,
      p_store_account_id: input.storeAccountId, p_target_member_id: input.targetMemberId })
  });
}
