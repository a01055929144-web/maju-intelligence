import type { LeadFavoriteRepository } from "@/domains/lead/lead-favorite";
import { supabaseRequest } from "@/lib/store";

type RpcRow = {
  lead_id: string;
  starred: boolean;
  starred_at: string | null;
  starred_by_name: string | null;
  starred_by_user_id: string | null;
};

export const leadFavoriteRepository: LeadFavoriteRepository = {
  async getMany(companyId, leadIds) {
    const rows = await supabaseRequest<RpcRow[]>(`company_lead_favorites?company_id=eq.${encodeURIComponent(companyId)}&lead_id=in.(${leadIds.map((id) => encodeURIComponent(id)).join(",")})&select=lead_id,starred_at,starred_by_name,starred_by_user_id`);
    return rows.map((row) => ({
      leadId: row.lead_id,
      starred: true,
      starredAt: row.starred_at,
      starredByName: row.starred_by_name,
      starredByUserId: row.starred_by_user_id
    }));
  },
  async set(input) {
    const rows = await supabaseRequest<RpcRow[]>("rpc/set_company_lead_favorite_v1", {
      method: "POST",
      body: JSON.stringify({
        p_actor_name: input.actorName,
        p_actor_user_id: input.actorUserId,
        p_company_id: input.companyId,
        p_lead_id: input.leadId,
        p_starred: input.starred
      })
    });
    const row = rows[0];
    if (!row) throw new Error("즐겨찾기 저장 결과를 확인할 수 없습니다.");
    return {
      leadId: row.lead_id,
      starred: row.starred,
      starredAt: row.starred_at,
      starredByName: row.starred_by_name,
      starredByUserId: row.starred_by_user_id
    };
  }
};

export function leadFavoritesEnabled(companyId: string) {
  if (process.env.FEATURE_LEAD_FAVORITES !== "true") return false;
  return (process.env.FEATURE_LEAD_FAVORITES_COMPANY_IDS || "")
    .split(",")
    .some((id) => id.trim() === companyId);
}
