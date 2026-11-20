import "server-only";

import { supabaseRequest } from "../store";

export type StorePriceVisibilityItem = {
  businessStatus: string;
  confirmedAt: string | null;
  id: string;
  name: string;
  reference: { foodPermitMatch: boolean | null; joinedFromCompanyLink: boolean; ntsActiveBusiness: boolean };
  status: "confirmed" | "pending";
};

type AccountRow = {
  business_status: string;
  business_status_verified_at: string | null;
  id: string;
  invite_code_id: string | null;
  price_visibility_confirmed_at: string | null;
  price_visibility_status: "confirmed" | "pending";
  store_profiles: { origin: string; store_name: string } | null;
};

const roleOf = (row?: { permission_role: string | null; role: string | null }) =>
  row?.permission_role || (row?.role === "owner" || row?.role === "manager" ? row.role : "staff");

export async function getCompanyPriceVisibilityActor(input: {
  companyId: string; companyMemberId?: string; userId?: string;
}): Promise<{ id: string; role: "manager" | "owner" } | null> {
  const identity = input.companyMemberId
    ? `id=eq.${encodeURIComponent(input.companyMemberId)}`
    : input.userId ? `user_id=eq.${encodeURIComponent(input.userId)}` : "";
  if (!identity) return null;
  const rows = await supabaseRequest<Array<{ id: string; permission_role: string | null; role: string | null }>>(
    `company_members?select=id,role,permission_role&company_id=eq.${encodeURIComponent(input.companyId)}&${identity}&status=eq.active&limit=1`);
  const role = roleOf(rows[0]);
  return rows[0] && (role === "owner" || role === "manager") ? { id: rows[0].id, role } : null;
}

const toItem = (row: AccountRow): StorePriceVisibilityItem => ({
  businessStatus: row.business_status,
  confirmedAt: row.price_visibility_confirmed_at,
  id: row.id,
  name: row.store_profiles?.store_name?.trim() || "이름 없는 매장",
  reference: {
    foodPermitMatch: null,
    joinedFromCompanyLink: Boolean(row.invite_code_id || row.store_profiles?.origin === "link"),
    ntsActiveBusiness: row.business_status === "active" && Boolean(row.business_status_verified_at)
  },
  status: row.price_visibility_status
});

export async function listStorePriceVisibility(companyId: string): Promise<StorePriceVisibilityItem[]> {
  const rows = await supabaseRequest<AccountRow[]>(
    `store_accounts?select=id,business_status,business_status_verified_at,invite_code_id,price_visibility_status,price_visibility_confirmed_at,store_profiles(store_name,origin)&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&order=created_at.desc`);
  return rows.map(toItem);
}

export async function setStorePriceVisibility(input: {
  action: "cancel" | "confirm"; actorCompanyMemberId: string; companyId: string; memo?: string; storeAccountId: string;
}) {
  const rows = await supabaseRequest<AccountRow[]>(
    `store_accounts?select=id,business_status,business_status_verified_at,invite_code_id,price_visibility_status,price_visibility_confirmed_at,store_profiles(store_name,origin)&company_id=eq.${encodeURIComponent(input.companyId)}&id=eq.${encodeURIComponent(input.storeAccountId)}&status=eq.active&limit=1`);
  if (!rows[0]) throw new Error("store_account_not_found");
  const reference = toItem(rows[0]).reference;
  return supabaseRequest<Record<string, unknown>>("rpc/set_store_price_visibility_v1", {
    method: "POST",
    body: JSON.stringify({ p_action: input.action, p_actor_company_member: input.actorCompanyMemberId,
      p_company: input.companyId, p_memo: input.memo?.trim() || null, p_reference_snapshot: reference,
      p_store_account: input.storeAccountId })
  });
}
