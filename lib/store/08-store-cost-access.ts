import "server-only";

import { isStoreAccountRole, type StoreAccountRole } from "../../domains/organization/store-cost-access";
import { supabaseRequest } from "../store";

export type StoreCostMemberAccess = {
  id: string;
  role: StoreAccountRole;
  status: "active";
};

type StoreCostAccessInput = {
  authUserId: string;
  companyId: string;
  storeAccountId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Server-only membership lookup. `authUserId` must come from the verified Kakao
 * server session, never request input or a public store-link token.
 */
export async function getStoreCostMemberAccess(input: StoreCostAccessInput): Promise<StoreCostMemberAccess | null> {
  if (!UUID_PATTERN.test(input?.companyId) || !UUID_PATTERN.test(input?.storeAccountId) || !UUID_PATTERN.test(input?.authUserId)) return null;

  const rows = await supabaseRequest<Array<{ id: string; role: string; status: string }>>(
    `store_account_members?select=id,role,status&company_id=eq.${encodeURIComponent(input.companyId)}&store_account_id=eq.${encodeURIComponent(input.storeAccountId)}&auth_user_id=eq.${encodeURIComponent(input.authUserId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  if (!member || member.status !== "active" || !isStoreAccountRole(member.role)) return null;
  return { id: member.id, role: member.role, status: "active" };
}
