import "server-only";

import { getStoreSession } from "../auth";
import { getStoreCostMemberAccess } from "./08-store-cost-access";
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
