import "server-only";

import { getStoreSession } from "../auth";
import { getStoreCostMemberAccess } from "./08-store-cost-access";
import { supabaseRequest } from "../store";
import type { StoreAccountRole } from "../../domains/organization/store-cost-access";

export type StoreMemberContext = {
  authUserId: string;
  companyId: string;
  memberId: string;
  role: StoreAccountRole;
  status: "active";
  storeAccountId: string;
};

export async function getStoreMemberContext(input: { companyId: string; storeAccountId: string }): Promise<StoreMemberContext | null> {
  const session = await getStoreSession();
  if (!session) return null;
  const member = await getStoreCostMemberAccess({ ...input, authUserId: session.authUserId });
  if (!member) return null;
  return { authUserId: session.authUserId, companyId: input.companyId, memberId: member.id,
    role: member.role, status: "active", storeAccountId: input.storeAccountId };
}

export async function getStoreOrderMemberContext(input: { companyId: string; customerId: string }) {
  const rows = await supabaseRequest<Array<{ id: string }>>(
    `store_accounts?select=id&company_id=eq.${encodeURIComponent(input.companyId)}&customer_id=eq.${encodeURIComponent(input.customerId)}&status=eq.active&business_status=eq.active&limit=1`
  );
  const storeAccountId = rows[0]?.id;
  if (!storeAccountId) return null;
  const member = await getStoreMemberContext({ companyId: input.companyId, storeAccountId });
  return member ? { ...member, customerId: input.customerId } : null;
}

export async function getStoreOrderMemberContextForCompany(companyId: string) {
  const session = await getStoreSession();
  if (!session) return null;
  const memberships = await supabaseRequest<Array<{ store_account_id: string }>>(
    `store_account_members?select=store_account_id&company_id=eq.${encodeURIComponent(companyId)}` +
    `&auth_user_id=eq.${encodeURIComponent(session.authUserId)}&status=eq.active&limit=2`
  );
  if (memberships.length !== 1) return null;
  const storeAccountId = memberships[0].store_account_id;
  const stores = await supabaseRequest<Array<{ customer_id: string }>>(
    `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(storeAccountId)}` +
    `&status=eq.active&business_status=eq.active&limit=1`
  );
  const customerId = stores[0]?.customer_id;
  if (!customerId) return null;
  const member = await getStoreMemberContext({ companyId, storeAccountId });
  return member ? { ...member, customerId } : null;
}
