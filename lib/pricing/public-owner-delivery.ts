import "server-only";
import { assignCustomerByTerritory, supabaseRequest } from "../store";

export class PublicOwnerDeliveryUnavailable extends Error {
  constructor() { super("Public owner delivery unavailable"); }
}

/** Separate SQL approval and company rollout; OFF leaves the existing activation untouched. */
export async function resolvePublicOwnerDelivery(companyId: string, address: string) {
  if (process.env.STORE_PUBLIC_OWNER_DELIVERY_ENABLED !== "true" ||
    !(process.env.FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId)) return undefined;
  const recommendation = await assignCustomerByTerritory(companyId, address);
  if (recommendation.status !== "matched" || !recommendation.territoryId) throw new PublicOwnerDeliveryUnavailable();
  const rows = await supabaseRequest<Array<{ delivery_weekdays: number[] | null }>>(
    `store_order_territory_rules?select=delivery_weekdays&company_id=eq.${encodeURIComponent(companyId)}` +
    `&territory_id=eq.${encodeURIComponent(recommendation.territoryId)}&limit=1`);
  const days = rows[0]?.delivery_weekdays;
  if (!days?.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new PublicOwnerDeliveryUnavailable();
  return recommendation.territoryId;
}
