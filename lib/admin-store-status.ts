import { supabaseRequest } from "./store";
import type { AdminStoreStatusInput } from "../domains/store/admin-store-status";

export type AdminStoreStatusResult = {
  alreadyApplied: boolean;
  auditLogId: string;
  companyId: string;
  status: "active" | "suspended";
  storeProfileId: string;
};

export function setAdminStoreStatus(input: AdminStoreStatusInput, actor: { name: string; userId?: string }) {
  return supabaseRequest<AdminStoreStatusResult>("rpc/admin_set_store_profile_status_v1", {
    method: "POST",
    body: JSON.stringify({
      p_actor_name: actor.name,
      p_actor_user: actor.userId || null,
      p_company: input.companyId,
      p_request_key: input.requestKey,
      p_store_profile: input.storeProfileId,
      p_target_status: input.status,
    }),
  });
}
