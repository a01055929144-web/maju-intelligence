import "server-only";
import type { StoreConnectionChange } from "../../domains/organization/store-connection";
import { supabaseRequest } from "../store";
import { isStoreMemberCompanyAllowlisted } from "./07-store-member-feature";

export function storeConnectionEnabled(companyId: string) {
  return process.env.STORE_CONNECTION_MANAGEMENT_ENABLED === "true" && isStoreMemberCompanyAllowlisted(companyId);
}
export async function saveStoreConnection(input: StoreConnectionChange) {
  await supabaseRequest("rpc/change_store_connection_v1", { method: "POST", body: JSON.stringify({
    p_company_id: input.companyId, p_store_account_id: input.storeAccountId,
    p_member_id: input.memberId, p_auth_user_id: input.authUserId, p_action: input.action
  }) });
}
