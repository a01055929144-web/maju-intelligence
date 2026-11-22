import { supabaseRequest } from "@/lib/store";
import { storeOrderCutoffGuidanceEnabled } from "./store-order-cutoff-feature";

export type StoreProductCutoffRule = { cutoffDaysBefore: number; cutoffTime: string };

const missingColumns = (error: unknown) => /order_cutoff_(?:days_before|time).*(?:42703|does not exist|PGRST204|schema cache)|(?:42703|does not exist|PGRST204|schema cache).*order_cutoff_(?:days_before|time)/i
  .test(error instanceof Error ? error.message : String(error));

/** Optional S-3b columns must never break the existing store order path. */
export async function readStoreProductCutoffs(companyId: string, productIds: string[]) {
  const rules = new Map<string, StoreProductCutoffRule>();
  if (!productIds.length || !storeOrderCutoffGuidanceEnabled(companyId)) return rules;
  try {
    const rows = await supabaseRequest<Array<{ id: string; order_cutoff_days_before: number | null; order_cutoff_time: string | null }>>(
      `product_catalog?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${productIds.join(",")})&select=id,order_cutoff_days_before,order_cutoff_time&limit=300`,
    );
    for (const row of rows) if (row.order_cutoff_days_before !== null && row.order_cutoff_time) {
      rules.set(row.id, { cutoffDaysBefore: row.order_cutoff_days_before, cutoffTime: row.order_cutoff_time.slice(0, 5) });
    }
    return rules;
  } catch (error) {
    if (missingColumns(error)) return rules;
    throw error;
  }
}
