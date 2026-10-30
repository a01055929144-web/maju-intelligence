import { supabaseRequest } from "./store";
export type AdminStoreAreaProfile = {
  measuredAt: string;
  profile: Record<string, unknown>;
  sourceComparison: Record<string, unknown>;
};

export async function getAdminStoreAreaProfile(companyId: string) {
  return supabaseRequest<AdminStoreAreaProfile>("rpc/admin_store_area_profile", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId })
  });
}
