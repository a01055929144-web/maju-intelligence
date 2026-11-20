import "server-only";

import { createHash, randomBytes } from "crypto";
import type { StoreAccountRole } from "../../domains/organization/store-cost-access";
import { supabaseRequest } from "../store";

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type PreparedStoreMemberInvitation = {
  companyId: string;
  displayName?: string;
  memberId: string;
  profileId?: string;
  role: Exclude<StoreAccountRole, "owner">;
  storeName?: string;
  storeAccountId: string;
};

export type StoreMemberListItem = {
  id: string;
  joinedAt: string | null;
  name: string;
  role: StoreAccountRole;
  status: "active" | "invited";
};

export async function listStoreMembers(input: { companyId: string; storeAccountId: string }): Promise<StoreMemberListItem[]> {
  const rows = await supabaseRequest<Array<{
    app_users: { name: string | null } | null;
    id: string;
    joined_at: string | null;
    role: StoreAccountRole;
    status: "active" | "invited";
  }>>(`store_account_members?select=id,role,status,joined_at,app_users(name)&company_id=eq.${encodeURIComponent(input.companyId)}&store_account_id=eq.${encodeURIComponent(input.storeAccountId)}&status=in.(active,invited)&order=role.asc,joined_at.asc.nullslast`);
  return rows.map(row => ({ id: row.id, joinedAt: row.joined_at, name: row.app_users?.name?.trim() || "초대 대기",
    role: row.role, status: row.status }));
}

async function getStoreProfileId(companyId: string, storeAccountId: string) {
  const rows = await supabaseRequest<Array<{ store_profile_id: string | null }>>(
    `store_accounts?select=store_profile_id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}&status=eq.active&limit=1`);
  return rows[0]?.store_profile_id || null;
}

export async function listStoreProfileMembers(input: { companyId: string; storeAccountId: string }): Promise<StoreMemberListItem[]> {
  const profileId = await getStoreProfileId(input.companyId, input.storeAccountId);
  if (!profileId) throw new Error("store_profile_not_found");
  const [members, invitations] = await Promise.all([
    supabaseRequest<Array<{ app_users: { name: string | null } | null; id: string; joined_at: string; role: StoreAccountRole }>>(
      `store_profile_members?select=id,role,joined_at,app_users(name)&store_profile_id=eq.${encodeURIComponent(profileId)}&status=eq.active&order=role.asc,joined_at.asc`),
    supabaseRequest<Array<{ display_name: string; expires_at: string; id: string; role: Exclude<StoreAccountRole, "owner"> }>>(
      `store_profile_member_invitations?select=id,role,display_name,expires_at&store_profile_id=eq.${encodeURIComponent(profileId)}&consumed_at=is.null&cancelled_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.asc`),
  ]);
  return [...members.map(row => ({ id: row.id, joinedAt: row.joined_at, name: row.app_users?.name?.trim() || "이름 없음", role: row.role, status: "active" as const })),
    ...invitations.map(row => ({ id: `invite:${row.id}`, joinedAt: null, name: row.display_name, role: row.role, status: "invited" as const }))];
}

export async function createStoreProfileMemberInvitation(input: { authUserId: string; companyId: string; displayName: string;
  role: Exclude<StoreAccountRole, "owner">; storeAccountId: string }) {
  const profileId = await getStoreProfileId(input.companyId, input.storeAccountId);
  if (!profileId) throw new Error("store_profile_not_found");
  const token = randomBytes(32).toString("base64url");
  await supabaseRequest("rpc/create_store_profile_member_invitation_v1", { method: "POST", body: JSON.stringify({
    p_auth_user_id: input.authUserId, p_display_name: input.displayName, p_invite_token_hash: hashToken(token),
    p_role: input.role, p_store_profile: profileId,
  }) });
  return token;
}

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
  const profileInvitations = await supabaseRequest<Array<{ display_name: string; id: string; role: string; store_profile_id: string;
    store_profiles: { store_name: string } | null }>>(
    `store_profile_member_invitations?select=id,store_profile_id,role,display_name,store_profiles(store_name)&invite_token_hash=eq.${hashToken(token)}` +
    `&consumed_at=is.null&cancelled_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`).catch(() => []);
  const profileInvite = profileInvitations[0];
  if (profileInvite && (profileInvite.role === "manager" || profileInvite.role === "staff")) {
    const accounts = await supabaseRequest<Array<{ company_id: string; id: string }>>(
      `store_accounts?select=id,company_id&store_profile_id=eq.${encodeURIComponent(profileInvite.store_profile_id)}&status=eq.active&order=created_at.asc&limit=1`);
    if (accounts[0]) return { companyId: accounts[0].company_id, displayName: profileInvite.display_name, memberId: profileInvite.id,
      profileId: profileInvite.store_profile_id, role: profileInvite.role, storeAccountId: accounts[0].id,
      storeName: profileInvite.store_profiles?.store_name || "매장" };
  }
  const invitedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRequest<Array<{ company_id: string; id: string; role: string; store_account_id: string }>>(
    `store_account_members?select=id,company_id,store_account_id,role,store_accounts!store_account_members_company_id_store_account_id_fkey!inner(id)&invite_token_hash=eq.${hashToken(token)}&status=eq.invited&invited_at=gt.${encodeURIComponent(invitedAfter)}&store_accounts.status=eq.active&store_accounts.business_status=in.(active,registration_pending)&limit=1`
  );
  const row = rows[0];
  if (!row || (row.role !== "manager" && row.role !== "staff")) return null;
  return { companyId: row.company_id, memberId: row.id, role: row.role, storeAccountId: row.store_account_id };
}

export async function acceptStoreMemberInvitation(input: {
  authUserId: string;
  companyId: string;
  profileId?: string;
  storeAccountId: string;
  token: string;
}) {
  if (!INVITE_TOKEN.test(input.token)) throw new Error("store_invitation_invalid");
  if (input.profileId) return supabaseRequest<Record<string, unknown>>("rpc/accept_store_profile_member_invitation_v1", {
    method: "POST", body: JSON.stringify({ p_auth_user_id: input.authUserId, p_invite_token_hash: hashToken(input.token) })
  });
  return supabaseRequest<Record<string, unknown>>("rpc/accept_store_member_invitation_v1", {
    method: "POST",
    body: JSON.stringify({ p_auth_user_id: input.authUserId, p_company_id: input.companyId,
      p_invite_token_hash: hashToken(input.token), p_store_account_id: input.storeAccountId })
  });
}

export async function removeStoreProfileMember(input: { authUserId: string; companyId: string; storeAccountId: string; targetMemberId: string }) {
  const profileId = await getStoreProfileId(input.companyId, input.storeAccountId);
  if (!profileId) throw new Error("store_profile_not_found");
  return supabaseRequest<Record<string, unknown>>("rpc/remove_store_profile_member_v1", { method: "POST", body: JSON.stringify({
    p_auth_user_id: input.authUserId, p_store_profile: profileId, p_target_member: input.targetMemberId,
  }) });
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
