import type { MapFilterPresetFilters } from "../map-filter-presets";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

export type MapFilterPreset = {
  id: string;
  name: string;
  filters: MapFilterPresetFilters;
  updatedAt: string;
};

export async function getMapFilterPresets(companyId: string, actorKey: string): Promise<MapFilterPreset[]> {
  if (!isProductionStoreConfigured()) return [];
  const rows = await supabaseRequest<Array<{ id: string; name: string; filters: MapFilterPresetFilters; updated_at: string }>>(
    `map_filter_presets?select=id,name,filters,updated_at&company_id=eq.${encodeURIComponent(companyId)}&actor_key=eq.${encodeURIComponent(actorKey)}&order=updated_at.desc`
  );
  return rows.map((row) => ({ id: row.id, name: row.name, filters: row.filters, updatedAt: row.updated_at }));
}

export async function saveMapFilterPreset(input: { appUserId?: string; actorKey: string; companyId: string; filters: MapFilterPresetFilters; name: string }) {
  if (!isProductionStoreConfigured()) throw new Error("Supabase is not configured.");
  const rows = await supabaseRequest<Array<{ id: string; name: string; filters: MapFilterPresetFilters; updated_at: string }>>(
    "map_filter_presets?on_conflict=company_id,actor_key,name",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{ company_id: input.companyId, actor_key: input.actorKey, app_user_id: input.appUserId || null, name: input.name, filters: input.filters, updated_at: new Date().toISOString() }])
    }
  );
  const row = rows[0];
  return { id: row.id, name: row.name, filters: row.filters, updatedAt: row.updated_at } satisfies MapFilterPreset;
}

export async function deleteMapFilterPreset(companyId: string, actorKey: string, presetId: string) {
  if (!isProductionStoreConfigured()) return;
  await supabaseRequest(`map_filter_presets?id=eq.${encodeURIComponent(presetId)}&company_id=eq.${encodeURIComponent(companyId)}&actor_key=eq.${encodeURIComponent(actorKey)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}
